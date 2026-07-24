package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestVerify(t *testing.T) {
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}

	keyID := "test-key"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		_ = json.NewEncoder(w).Encode(jwksDocument{Keys: []jwk{{
			Algorithm: "ES256",
			Curve:     "P-256",
			KeyID:     keyID,
			KeyType:   "EC",
			X:         encodeInteger(privateKey.PublicKey.X),
			Y:         encodeInteger(privateKey.PublicKey.Y),
		}}})
	}))
	defer server.Close()

	verifier := NewVerifier(server.URL, "authenticated", server.Client())
	claims := Claims{
		Subject:   "user-id",
		Role:      "authenticated",
		SessionID: "session-id",
		Issuer:    server.URL + "/auth/v1",
		Audience:  Audience{"authenticated"},
		IssuedAt:  time.Now().Add(-time.Minute).Unix(),
		ExpiresAt: time.Now().Add(time.Hour).Unix(),
	}

	token := signedToken(t, privateKey, keyID, claims)
	actual, err := verifier.Verify(context.Background(), token)
	if err != nil {
		t.Fatalf("Verify() returned an error: %v", err)
	}
	if actual.Subject != claims.Subject {
		t.Fatalf("expected subject %q, got %q", claims.Subject, actual.Subject)
	}

	claims.ExpiresAt = time.Now().Add(-time.Minute).Unix()
	_, err = verifier.Verify(context.Background(), signedToken(t, privateKey, keyID, claims))
	if !errors.Is(err, ErrExpiredToken) {
		t.Fatalf("expected ErrExpiredToken, got %v", err)
	}
}

func TestVerifyRejectsMalformedToken(t *testing.T) {
	verifier := NewVerifier("https://project.supabase.co", "authenticated", nil)
	if _, err := verifier.Verify(context.Background(), "not-a-jwt"); !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("expected ErrInvalidToken, got %v", err)
	}
}

func signedToken(t *testing.T, key *ecdsa.PrivateKey, keyID string, claims Claims) string {
	t.Helper()
	header := encodeJSON(t, tokenHeader{Algorithm: "ES256", KeyID: keyID})
	payload := encodeJSON(t, claims)
	input := header + "." + payload
	digest := sha256.Sum256([]byte(input))
	r, s, err := ecdsa.Sign(rand.Reader, key, digest[:])
	if err != nil {
		t.Fatal(err)
	}

	signature := make([]byte, 64)
	r.FillBytes(signature[:32])
	s.FillBytes(signature[32:])
	return input + "." + base64.RawURLEncoding.EncodeToString(signature)
}

func encodeJSON(t *testing.T, value any) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return base64.RawURLEncoding.EncodeToString(encoded)
}

func encodeInteger(value *big.Int) string {
	bytes := make([]byte, 32)
	value.FillBytes(bytes)
	return base64.RawURLEncoding.EncodeToString(bytes)
}
