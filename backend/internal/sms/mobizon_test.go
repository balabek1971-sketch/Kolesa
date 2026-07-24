package sms

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestMobizonSendOTP(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("expected POST, got %s", r.Method)
		}
		if r.URL.Query().Get("apiKey") != "test-api-key" {
			t.Fatal("expected API key in query")
		}
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm() returned an error: %v", err)
		}
		if r.Form.Get("recipient") != "77001234567" {
			t.Fatalf("unexpected recipient: %q", r.Form.Get("recipient"))
		}
		if r.Form.Get("text") != "QazAuto: kod vhoda 123456. Nikomu ne soobshchaite ego." {
			t.Fatalf("unexpected message: %q", r.Form.Get("text"))
		}
		if r.Form.Get("from") != "QazAuto" {
			t.Fatalf("unexpected sender: %q", r.Form.Get("from"))
		}
		if r.Form.Get("params[validity]") != "60" {
			t.Fatalf("unexpected validity: %q", r.Form.Get("params[validity]"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":0,"data":{"campaignId":1,"messageId":42,"status":2}}`))
	}))
	defer server.Close()

	client := &http.Client{Timeout: time.Second}
	sender := NewMobizon(server.URL, "test-api-key", "QazAuto", client)
	result, err := sender.SendOTP(context.Background(), "+77001234567", "123456")
	if err != nil {
		t.Fatalf("SendOTP() returned an error: %v", err)
	}
	if result.Provider != "mobizon" || result.MessageID != "42" {
		t.Fatalf("unexpected result: %#v", result)
	}
}

func TestMobizonAcceptsSupabasePhoneFormat(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseForm(); err != nil {
			t.Fatalf("ParseForm() returned an error: %v", err)
		}
		if r.Form.Get("recipient") != "77001234567" {
			t.Fatalf("unexpected recipient: %q", r.Form.Get("recipient"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":0,"data":{"messageId":43}}`))
	}))
	defer server.Close()

	sender := NewMobizon(server.URL, "test-api-key", "", server.Client())
	if _, err := sender.SendOTP(context.Background(), "77001234567", "123456"); err != nil {
		t.Fatalf("SendOTP() returned an error: %v", err)
	}
}

func TestMobizonRejectsInvalidInput(t *testing.T) {
	sender := NewMobizon("https://api.mobizon.kz", "test-api-key", "", nil)

	if _, err := sender.SendOTP(context.Background(), "+15551234567", "123456"); err == nil {
		t.Fatal("expected a non-Kazakhstan number to be rejected")
	}
	if _, err := sender.SendOTP(context.Background(), "+77001234567", "12ab56"); err == nil {
		t.Fatal("expected a non-numeric OTP to be rejected")
	}
}

func TestMobizonHandlesProviderError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":1,"message":"invalid parameters","data":{}}`))
	}))
	defer server.Close()

	sender := NewMobizon(server.URL, "test-api-key", "", server.Client())
	if _, err := sender.SendOTP(context.Background(), "+77001234567", "123456"); err == nil {
		t.Fatal("expected provider rejection to be returned")
	}
}
