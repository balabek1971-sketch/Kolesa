package moderation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEnqueue(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/enqueue" || r.Header.Get("Authorization") != "Bearer shared-secret" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		var payload struct {
			ListingID string `json:"listing_id"`
			Revision  int    `json:"revision"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatal(err)
		}
		if payload.ListingID != "listing-1" || payload.Revision != 3 {
			t.Fatalf("unexpected payload: %#v", payload)
		}
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	client := New(server.URL, "shared-secret", server.Client())
	if err := client.Enqueue(context.Background(), "listing-1", 3); err != nil {
		t.Fatalf("Enqueue returned an error: %v", err)
	}
}

func TestConfigured(t *testing.T) {
	if New("", "", nil).Configured() {
		t.Fatal("empty dispatcher must not be configured")
	}
	if !New("https://moderation.example", "secret", nil).Configured() {
		t.Fatal("complete dispatcher config must be accepted")
	}
}
