package moderation

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Dispatcher interface {
	Configured() bool
	Enqueue(context.Context, string, int) error
}

type Client struct {
	baseURL string
	secret  string
	http    *http.Client
}

func New(baseURL, secret string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 8 * time.Second}
	}
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		secret:  secret,
		http:    httpClient,
	}
}

func (c *Client) Configured() bool {
	return c.baseURL != "" && c.secret != ""
}

func (c *Client) Enqueue(ctx context.Context, listingID string, revision int) error {
	payload, err := json.Marshal(map[string]any{
		"listing_id": listingID,
		"revision":   revision,
	})
	if err != nil {
		return err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/enqueue", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+c.secret)
	request.Header.Set("Content-Type", "application/json")

	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(response.Body, 4<<10))
		return fmt.Errorf("moderation worker returned %s: %s", response.Status, strings.TrimSpace(string(raw)))
	}
	return nil
}
