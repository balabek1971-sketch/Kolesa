package sms

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAutoCallSendOTP(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/bulks" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Fatal("expected bearer token")
		}

		var payload autoCallRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("Decode() returned an error: %v", err)
		}
		if payload.Name != "QazAuto OTP" {
			t.Fatalf("unexpected campaign name: %q", payload.Name)
		}
		if payload.Text != "QazAuto: kod vhoda 123456. Nikomu ne soobshchaite ego." {
			t.Fatalf("unexpected message: %q", payload.Text)
		}
		if len(payload.Recipients) != 1 || payload.Recipients[0].Number != "+77001234567" {
			t.Fatalf("unexpected recipients: %#v", payload.Recipients)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":12345,"status":"running"}`))
	}))
	defer server.Close()

	sender := NewAutoCall(server.URL+"/api/v1", "test-token", server.Client())
	result, err := sender.SendOTP(context.Background(), "+77001234567", "123456")
	if err != nil {
		t.Fatalf("SendOTP() returned an error: %v", err)
	}
	if result.Provider != "autocall" || result.MessageID != "12345" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestAutoCallRejectsInvalidInput(t *testing.T) {
	sender := NewAutoCall("https://autocall.kz/api/v1", "test-token", nil)
	if _, err := sender.SendOTP(context.Background(), "+15551234567", "123456"); err == nil {
		t.Fatal("expected a non-Kazakhstan number to be rejected")
	}
	if _, err := sender.SendOTP(context.Background(), "+77001234567", "12ab56"); err == nil {
		t.Fatal("expected a non-numeric OTP to be rejected")
	}
}

func TestAutoCallHandlesProviderErrorWithoutLeakingBody(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"message":"invalid +77001234567, OTP 123456"}`))
	}))
	defer server.Close()

	sender := NewAutoCall(server.URL, "test-token", server.Client())
	_, err := sender.SendOTP(context.Background(), "+77001234567", "123456")
	if err == nil {
		t.Fatal("expected provider rejection")
	}
	if err.Error() != "autocall returned HTTP 422" {
		t.Fatalf("unexpected error: %q", err.Error())
	}
	if strings.Contains(err.Error(), "+77001234567") || strings.Contains(err.Error(), "123456") {
		t.Fatalf("provider error leaked sensitive data: %q", err.Error())
	}
}
