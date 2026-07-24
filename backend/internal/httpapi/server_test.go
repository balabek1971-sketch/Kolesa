package httpapi

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/balabek1971-sketch/Kolesa/backend/internal/authhook"
	"github.com/balabek1971-sketch/Kolesa/backend/internal/config"
	"github.com/balabek1971-sketch/Kolesa/backend/internal/sms"
)

func TestHealth(t *testing.T) {
	handler, err := New(testConfig(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("New() returned an error: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", recorder.Code)
	}

	if recorder.Header().Get("X-Request-ID") == "" {
		t.Fatal("expected a request ID")
	}
}

func TestRejectsUnknownOrigin(t *testing.T) {
	handler, err := New(testConfig(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("New() returned an error: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/v1/status", nil)
	request.Header.Set("Origin", "https://attacker.example")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected status 403, got %d", recorder.Code)
	}
}

func TestMeRequiresAuthentication(t *testing.T) {
	handler, err := New(testConfig(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("New() returned an error: %v", err)
	}
	request := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", recorder.Code)
	}
}

func TestBearerToken(t *testing.T) {
	tests := map[string]string{
		"Bearer token": "token",
		"bearer token": "token",
		"Basic token":  "",
		"Bearer":       "",
		"Bearer a b":   "",
	}

	for input, expected := range tests {
		if actual := bearerToken(input); actual != expected {
			t.Errorf("bearerToken(%q) = %q; expected %q", input, actual, expected)
		}
	}
}

func TestSendSMSHook(t *testing.T) {
	secret := []byte("01234567890123456789012345678901")
	verifier, err := authhook.NewVerifier("v1,whsec_"+base64.StdEncoding.EncodeToString(secret), 5*time.Minute)
	if err != nil {
		t.Fatalf("NewVerifier() returned an error: %v", err)
	}
	sender := &recordingSMSSender{}
	handler := newHandler(
		testConfig(),
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		verifier,
		sender,
	)

	payload := []byte(`{"user":{"phone":"+77001234567"},"sms":{"otp":"123456"}}`)
	request := signedHookRequest(secret, "msg_123", payload)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if sender.calls != 1 || sender.phone != "+77001234567" || sender.otp != "123456" {
		t.Fatalf("unexpected sender call: %#v", sender)
	}

	replayRecorder := httptest.NewRecorder()
	handler.ServeHTTP(replayRecorder, signedHookRequest(secret, "msg_123", payload))
	if replayRecorder.Code != http.StatusOK || sender.calls != 1 {
		t.Fatal("expected replay to succeed without sending a duplicate SMS")
	}
}

func TestSendSMSHookRejectsInvalidSignature(t *testing.T) {
	secret := []byte("01234567890123456789012345678901")
	verifier, err := authhook.NewVerifier(base64.StdEncoding.EncodeToString(secret), 5*time.Minute)
	if err != nil {
		t.Fatalf("NewVerifier() returned an error: %v", err)
	}
	sender := &recordingSMSSender{}
	handler := newHandler(
		testConfig(),
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		verifier,
		sender,
	)

	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/hooks/supabase/send-sms",
		bytes.NewReader([]byte(`{"user":{"phone":"+77001234567"},"sms":{"otp":"123456"}}`)),
	)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected status 401, got %d", recorder.Code)
	}
	if sender.calls != 0 {
		t.Fatal("expected no SMS attempt")
	}
}

type recordingSMSSender struct {
	calls int
	phone string
	otp   string
}

func (s *recordingSMSSender) SendOTP(_ context.Context, phone, otp string) (sms.Result, error) {
	s.calls++
	s.phone = phone
	s.otp = otp
	return sms.Result{Provider: "test", MessageID: "message-1"}, nil
}

func signedHookRequest(secret []byte, id string, payload []byte) *http.Request {
	timestamp := strconv.FormatInt(time.Now().Unix(), 10)
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(id + "." + timestamp + "." + string(payload)))

	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/hooks/supabase/send-sms",
		bytes.NewReader(payload),
	)
	request.Header.Set("webhook-id", id)
	request.Header.Set("webhook-timestamp", timestamp)
	request.Header.Set("webhook-signature", "v1,"+base64.StdEncoding.EncodeToString(mac.Sum(nil)))
	return request
}

func testConfig() config.Config {
	return config.Config{
		Environment:         "test",
		WebOrigin:           "https://qazauto.example",
		SupabaseURL:         "https://project.supabase.co",
		SupabaseJWTAudience: "authenticated",
	}
}
