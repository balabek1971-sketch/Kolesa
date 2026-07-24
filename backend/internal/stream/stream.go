package stream

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

type Client struct {
	accountID string
	apiToken  string
	http      *http.Client
}

type Upload struct {
	UID       string
	UploadURL string
}

func New(accountID, apiToken string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{accountID: accountID, apiToken: apiToken, http: httpClient}
}

func (c *Client) Configured() bool {
	return c != nil && c.accountID != "" && c.apiToken != ""
}

func (c *Client) CreateDirectUpload(ctx context.Context, listingID, ownerID string) (Upload, error) {
	if !c.Configured() {
		return Upload{}, errors.New("cloudflare stream is not configured")
	}

	body, _ := json.Marshal(map[string]any{
		"maxDurationSeconds": 60,
		"requireSignedURLs":  false,
		"meta": map[string]string{
			"listing_id": listingID,
			"owner_id":   ownerID,
		},
	})
	endpoint := fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s/stream/direct_upload", c.accountID)
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return Upload{}, err
	}
	request.Header.Set("Authorization", "Bearer "+c.apiToken)
	request.Header.Set("Content-Type", "application/json")

	response, err := c.http.Do(request)
	if err != nil {
		return Upload{}, err
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return Upload{}, fmt.Errorf("stream direct upload returned %s: %s", response.Status, string(raw))
	}

	var payload struct {
		Success bool `json:"success"`
		Result  struct {
			UID       string `json:"uid"`
			UploadURL string `json:"uploadURL"`
		} `json:"result"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return Upload{}, err
	}
	if !payload.Success || payload.Result.UID == "" || payload.Result.UploadURL == "" {
		return Upload{}, errors.New("stream returned an incomplete upload intent")
	}
	return Upload{UID: payload.Result.UID, UploadURL: payload.Result.UploadURL}, nil
}
