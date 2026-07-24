package authhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

var (
	ErrInvalidSignature = errors.New("invalid webhook signature")
	ErrStaleRequest     = errors.New("webhook timestamp is outside the allowed tolerance")
)

type Headers struct {
	ID        string
	Timestamp string
	Signature string
}

type Verifier struct {
	secret    []byte
	tolerance time.Duration
	now       func() time.Time
}

func NewVerifier(secret string, tolerance time.Duration) (*Verifier, error) {
	decoded, err := decodeSecret(secret)
	if err != nil {
		return nil, err
	}
	if tolerance <= 0 {
		tolerance = 5 * time.Minute
	}
	return &Verifier{
		secret:    decoded,
		tolerance: tolerance,
		now:       time.Now,
	}, nil
}

func (v *Verifier) Verify(payload []byte, headers Headers) error {
	if headers.ID == "" || headers.Timestamp == "" || headers.Signature == "" {
		return ErrInvalidSignature
	}

	timestamp, err := strconv.ParseInt(headers.Timestamp, 10, 64)
	if err != nil {
		return ErrInvalidSignature
	}
	delta := v.now().Sub(time.Unix(timestamp, 0))
	if delta < -v.tolerance || delta > v.tolerance {
		return ErrStaleRequest
	}

	message := headers.ID + "." + headers.Timestamp + "." + string(payload)
	mac := hmac.New(sha256.New, v.secret)
	_, _ = mac.Write([]byte(message))
	expected := mac.Sum(nil)

	for _, candidate := range strings.Fields(headers.Signature) {
		version, encoded, found := strings.Cut(candidate, ",")
		if !found || version != "v1" {
			continue
		}
		actual, err := base64.StdEncoding.DecodeString(encoded)
		if err == nil && hmac.Equal(actual, expected) {
			return nil
		}
	}

	return ErrInvalidSignature
}

func decodeSecret(secret string) ([]byte, error) {
	secret = strings.TrimSpace(secret)
	secret = strings.TrimPrefix(secret, "v1,")
	secret = strings.TrimPrefix(secret, "whsec_")
	if secret == "" {
		return nil, errors.New("webhook secret is empty")
	}

	decoded, err := base64.StdEncoding.DecodeString(secret)
	if err != nil {
		decoded, err = base64.RawStdEncoding.DecodeString(secret)
	}
	if err != nil || len(decoded) < 24 {
		return nil, fmt.Errorf("webhook secret must be a base64-encoded key of at least 24 bytes")
	}
	return decoded, nil
}
