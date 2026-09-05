package stream

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestVerifyWebhook(t *testing.T) {
	secret := "stream-secret"
	body := []byte(`{"uid":"video-1","readyToStream":true}`)
	now := time.Date(2026, 9, 5, 10, 0, 0, 0, time.UTC)
	timestamp := now.Unix()
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte("1788602400."))
	_, _ = mac.Write(body)
	header := "time=" + strings.TrimSpace("1788602400") + ",sig1=" + hex.EncodeToString(mac.Sum(nil))

	client := New("account", "token", secret, nil)
	if timestamp != 1788602400 {
		t.Fatalf("test timestamp changed: %d", timestamp)
	}
	if err := client.VerifyWebhook(header, body, now); err != nil {
		t.Fatalf("expected valid webhook: %v", err)
	}
	if err := client.VerifyWebhook(header+"00", body, now); err == nil {
		t.Fatal("expected modified signature to fail")
	}
}

func TestCreateDirectUpload(t *testing.T) {
	httpClient := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodPost {
			t.Fatalf("unexpected method %s", request.Method)
		}
		if request.URL.Path != "/client/v4/accounts/account-id/stream/direct_upload" {
			t.Fatalf("unexpected path %s", request.URL.Path)
		}
		if request.Header.Get("Authorization") != "Bearer api-token" {
			t.Fatal("missing bearer token")
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Body:       io.NopCloser(strings.NewReader(`{"success":true,"result":{"uid":"stream-uid","uploadURL":"https://upload.example.test"}}`)),
			Header:     make(http.Header),
		}, nil
	})}

	client := New("account-id", "api-token", "", httpClient)
	upload, err := client.CreateDirectUpload(context.Background(), "user-id", map[string]string{"listing_id": "listing-id"})
	if err != nil {
		t.Fatalf("create direct upload: %v", err)
	}
	if upload.UID != "stream-uid" || upload.UploadURL != "https://upload.example.test" {
		t.Fatalf("unexpected upload: %#v", upload)
	}
}
