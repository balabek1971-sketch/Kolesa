package authhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strconv"
	"testing"
	"time"
)

func TestVerifierAcceptsValidSignature(t *testing.T) {
	now := time.Unix(1_750_000_000, 0)
	secret := []byte("01234567890123456789012345678901")
	verifier, err := NewVerifier("v1,whsec_"+base64.StdEncoding.EncodeToString(secret), 5*time.Minute)
	if err != nil {
		t.Fatalf("NewVerifier() returned an error: %v", err)
	}
	verifier.now = func() time.Time { return now }

	payload := []byte(`{"user":{"phone":"+77001234567"},"sms":{"otp":"123456"}}`)
	headers := signedHeaders(secret, "msg_123", now.Unix(), payload)
	if err := verifier.Verify(payload, headers); err != nil {
		t.Fatalf("Verify() returned an error: %v", err)
	}
}

func TestVerifierRejectsTamperedPayload(t *testing.T) {
	now := time.Unix(1_750_000_000, 0)
	secret := []byte("01234567890123456789012345678901")
	verifier, err := NewVerifier(base64.StdEncoding.EncodeToString(secret), 5*time.Minute)
	if err != nil {
		t.Fatalf("NewVerifier() returned an error: %v", err)
	}
	verifier.now = func() time.Time { return now }

	payload := []byte(`{"otp":"123456"}`)
	headers := signedHeaders(secret, "msg_123", now.Unix(), payload)
	if err := verifier.Verify([]byte(`{"otp":"654321"}`), headers); !errors.Is(err, ErrInvalidSignature) {
		t.Fatalf("expected ErrInvalidSignature, got %v", err)
	}
}

func TestVerifierRejectsStaleTimestamp(t *testing.T) {
	now := time.Unix(1_750_000_000, 0)
	secret := []byte("01234567890123456789012345678901")
	verifier, err := NewVerifier(base64.StdEncoding.EncodeToString(secret), 5*time.Minute)
	if err != nil {
		t.Fatalf("NewVerifier() returned an error: %v", err)
	}
	verifier.now = func() time.Time { return now }

	payload := []byte(`{}`)
	headers := signedHeaders(secret, "msg_123", now.Add(-6*time.Minute).Unix(), payload)
	if err := verifier.Verify(payload, headers); !errors.Is(err, ErrStaleRequest) {
		t.Fatalf("expected ErrStaleRequest, got %v", err)
	}
}

func signedHeaders(secret []byte, id string, timestamp int64, payload []byte) Headers {
	timestampValue := strconv.FormatInt(timestamp, 10)
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(id + "." + timestampValue + "." + string(payload)))
	return Headers{
		ID:        id,
		Timestamp: timestampValue,
		Signature: "v1," + base64.StdEncoding.EncodeToString(mac.Sum(nil)),
	}
}
