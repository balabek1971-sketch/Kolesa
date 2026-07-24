package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"
)

var (
	ErrInvalidToken = errors.New("invalid access token")
	ErrExpiredToken = errors.New("expired access token")
)

type Audience []string

func (a *Audience) UnmarshalJSON(data []byte) error {
	var single string
	if err := json.Unmarshal(data, &single); err == nil {
		*a = Audience{single}
		return nil
	}

	var multiple []string
	if err := json.Unmarshal(data, &multiple); err != nil {
		return errors.New("invalid audience claim")
	}
	*a = multiple
	return nil
}

type Claims struct {
	Subject   string   `json:"sub"`
	Role      string   `json:"role"`
	Email     string   `json:"email"`
	Phone     string   `json:"phone"`
	SessionID string   `json:"session_id"`
	Issuer    string   `json:"iss"`
	Audience  Audience `json:"aud"`
	ExpiresAt int64    `json:"exp"`
	IssuedAt  int64    `json:"iat"`
	NotBefore int64    `json:"nbf"`
}

type Verifier struct {
	issuer   string
	audience string
	client   *http.Client

	mu        sync.RWMutex
	keys      map[string]*ecdsa.PublicKey
	keysUntil time.Time
}

type tokenHeader struct {
	Algorithm string `json:"alg"`
	KeyID     string `json:"kid"`
}

type jwksDocument struct {
	Keys []jwk `json:"keys"`
}

type jwk struct {
	Algorithm string `json:"alg"`
	Curve     string `json:"crv"`
	KeyID     string `json:"kid"`
	KeyType   string `json:"kty"`
	X         string `json:"x"`
	Y         string `json:"y"`
}

func NewVerifier(supabaseURL, audience string, client *http.Client) *Verifier {
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}
	return &Verifier{
		issuer:   strings.TrimRight(supabaseURL, "/") + "/auth/v1",
		audience: audience,
		client:   client,
		keys:     make(map[string]*ecdsa.PublicKey),
	}
}

func (v *Verifier) Verify(ctx context.Context, token string) (Claims, error) {
	if token == "" || len(token) > 16384 {
		return Claims{}, ErrInvalidToken
	}

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, ErrInvalidToken
	}

	var header tokenHeader
	if err := decodePart(parts[0], &header); err != nil {
		return Claims{}, ErrInvalidToken
	}
	if header.Algorithm != "ES256" || header.KeyID == "" {
		return Claims{}, ErrInvalidToken
	}

	var claims Claims
	if err := decodePart(parts[1], &claims); err != nil {
		return Claims{}, ErrInvalidToken
	}

	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil || len(signature) != 64 {
		return Claims{}, ErrInvalidToken
	}

	key, err := v.key(ctx, header.KeyID, false)
	if err != nil {
		return Claims{}, fmt.Errorf("load signing key: %w", err)
	}
	if !verifyES256(key, parts[0]+"."+parts[1], signature) {
		key, err = v.key(ctx, header.KeyID, true)
		if err != nil || !verifyES256(key, parts[0]+"."+parts[1], signature) {
			return Claims{}, ErrInvalidToken
		}
	}

	if err := v.validateClaims(claims, time.Now()); err != nil {
		return Claims{}, err
	}
	return claims, nil
}

func (v *Verifier) validateClaims(claims Claims, now time.Time) error {
	const clockSkew = 30 * time.Second
	unixNow := now.Unix()
	skewSeconds := int64(clockSkew.Seconds())

	if claims.ExpiresAt == 0 || unixNow >= claims.ExpiresAt+skewSeconds {
		return ErrExpiredToken
	}
	if claims.NotBefore != 0 && unixNow+skewSeconds < claims.NotBefore {
		return ErrInvalidToken
	}
	if claims.IssuedAt != 0 && claims.IssuedAt > unixNow+skewSeconds {
		return ErrInvalidToken
	}
	if claims.Issuer != v.issuer || !claims.Audience.contains(v.audience) {
		return ErrInvalidToken
	}
	if claims.Subject == "" || claims.SessionID == "" || claims.Role != "authenticated" {
		return ErrInvalidToken
	}
	return nil
}

func (v *Verifier) key(ctx context.Context, keyID string, forceRefresh bool) (*ecdsa.PublicKey, error) {
	v.mu.RLock()
	key := v.keys[keyID]
	fresh := time.Now().Before(v.keysUntil)
	v.mu.RUnlock()

	if key != nil && fresh && !forceRefresh {
		return key, nil
	}
	if err := v.refreshKeys(ctx); err != nil {
		return nil, err
	}

	v.mu.RLock()
	defer v.mu.RUnlock()
	key = v.keys[keyID]
	if key == nil {
		return nil, errors.New("signing key not found")
	}
	return key, nil
}

func (v *Verifier) refreshKeys(ctx context.Context) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, v.issuer+"/.well-known/jwks.json", nil)
	if err != nil {
		return err
	}
	request.Header.Set("Accept", "application/json")

	response, err := v.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("JWKS returned HTTP %d", response.StatusCode)
	}

	var document jwksDocument
	decoder := json.NewDecoder(io.LimitReader(response.Body, 64<<10))
	if err := decoder.Decode(&document); err != nil {
		return err
	}

	keys := make(map[string]*ecdsa.PublicKey)
	for _, rawKey := range document.Keys {
		if rawKey.KeyType != "EC" || rawKey.Curve != "P-256" || rawKey.Algorithm != "ES256" || rawKey.KeyID == "" {
			continue
		}
		xBytes, xErr := base64.RawURLEncoding.DecodeString(rawKey.X)
		yBytes, yErr := base64.RawURLEncoding.DecodeString(rawKey.Y)
		if xErr != nil || yErr != nil {
			continue
		}
		publicKey := &ecdsa.PublicKey{
			Curve: elliptic.P256(),
			X:     new(big.Int).SetBytes(xBytes),
			Y:     new(big.Int).SetBytes(yBytes),
		}
		if !publicKey.Curve.IsOnCurve(publicKey.X, publicKey.Y) {
			continue
		}
		keys[rawKey.KeyID] = publicKey
	}
	if len(keys) == 0 {
		return errors.New("JWKS contains no supported signing keys")
	}

	v.mu.Lock()
	v.keys = keys
	v.keysUntil = time.Now().Add(10 * time.Minute)
	v.mu.Unlock()
	return nil
}

func decodePart(encoded string, destination any) error {
	decoded, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return err
	}
	return json.Unmarshal(decoded, destination)
}

func verifyES256(key *ecdsa.PublicKey, signingInput string, signature []byte) bool {
	digest := sha256.Sum256([]byte(signingInput))
	r := new(big.Int).SetBytes(signature[:32])
	s := new(big.Int).SetBytes(signature[32:])
	return ecdsa.Verify(key, digest[:], r, s)
}

func (a Audience) contains(expected string) bool {
	for _, value := range a {
		if value == expected {
			return true
		}
	}
	return false
}
