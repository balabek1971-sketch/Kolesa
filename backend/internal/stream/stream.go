package stream

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	accountID     string
	apiToken      string
	webhookSecret string
	http          *http.Client
}

type DirectUpload struct {
	UID       string    `json:"uid"`
	UploadURL string    `json:"uploadURL"`
	ExpiresAt time.Time `json:"-"`
}

type Video struct {
	UID           string  `json:"uid"`
	ReadyToStream bool    `json:"readyToStream"`
	Duration      float64 `json:"duration"`
	Thumbnail     string  `json:"thumbnail"`
	Status        struct {
		State           string `json:"state"`
		ErrorReasonCode string `json:"errorReasonCode"`
		ErrorReasonText string `json:"errorReasonText"`
	} `json:"status"`
	Playback struct {
		HLS  string `json:"hls"`
		DASH string `json:"dash"`
	} `json:"playback"`
	Input struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	} `json:"input"`
}

type apiResponse[T any] struct {
	Result  T    `json:"result"`
	Success bool `json:"success"`
	Errors  []struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	} `json:"errors"`
}

func New(accountID, apiToken, webhookSecret string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 20 * time.Second}
	}
	return &Client{
		accountID:     strings.TrimSpace(accountID),
		apiToken:      strings.TrimSpace(apiToken),
		webhookSecret: strings.TrimSpace(webhookSecret),
		http:          httpClient,
	}
}

func (c *Client) Configured() bool {
	return c != nil && c.accountID != "" && c.apiToken != ""
}

func (c *Client) WebhookConfigured() bool {
	return c != nil && c.webhookSecret != ""
}

func (c *Client) CreateDirectUpload(ctx context.Context, creator string, metadata map[string]string) (DirectUpload, error) {
	if !c.Configured() {
		return DirectUpload{}, errors.New("cloudflare stream is not configured")
	}
	expiresAt := time.Now().UTC().Add(15 * time.Minute)
	payload := map[string]any{
		"maxDurationSeconds": 60,
		"creator":            creator,
		"expiry":             expiresAt.Format(time.RFC3339),
		"meta":               metadata,
		"requireSignedURLs":  false,
	}

	var response apiResponse[DirectUpload]
	if err := c.request(ctx, http.MethodPost, "/stream/direct_upload", payload, &response); err != nil {
		return DirectUpload{}, err
	}
	if !response.Success || response.Result.UID == "" || response.Result.UploadURL == "" {
		return DirectUpload{}, apiError(response.Errors)
	}
	response.Result.ExpiresAt = expiresAt
	return response.Result, nil
}

func (c *Client) GetVideo(ctx context.Context, uid string) (Video, error) {
	var response apiResponse[Video]
	if err := c.request(ctx, http.MethodGet, "/stream/"+uid, nil, &response); err != nil {
		return Video{}, err
	}
	if !response.Success || response.Result.UID == "" {
		return Video{}, apiError(response.Errors)
	}
	return response.Result, nil
}

func (c *Client) DeleteVideo(ctx context.Context, uid string) error {
	if uid == "" {
		return nil
	}
	var response apiResponse[any]
	return c.request(ctx, http.MethodDelete, "/stream/"+uid, nil, &response)
}

func (c *Client) VerifyWebhook(header string, body []byte, now time.Time) error {
	if !c.WebhookConfigured() {
		return errors.New("stream webhook is not configured")
	}
	parts := map[string]string{}
	for _, item := range strings.Split(header, ",") {
		name, value, ok := strings.Cut(strings.TrimSpace(item), "=")
		if ok {
			parts[name] = value
		}
	}
	timestamp, err := strconv.ParseInt(parts["time"], 10, 64)
	if err != nil || parts["sig1"] == "" {
		return errors.New("invalid webhook signature header")
	}
	signedAt := time.Unix(timestamp, 0)
	if signedAt.Before(now.Add(-5*time.Minute)) || signedAt.After(now.Add(time.Minute)) {
		return errors.New("webhook signature timestamp is outside tolerance")
	}

	mac := hmac.New(sha256.New, []byte(c.webhookSecret))
	_, _ = mac.Write([]byte(parts["time"] + "."))
	_, _ = mac.Write(body)
	expected := mac.Sum(nil)
	actual, err := hex.DecodeString(parts["sig1"])
	if err != nil || !hmac.Equal(expected, actual) {
		return errors.New("invalid webhook signature")
	}
	return nil
}

func (c *Client) request(ctx context.Context, method, path string, payload any, target any) error {
	if !c.Configured() {
		return errors.New("cloudflare stream is not configured")
	}
	var body io.Reader
	if payload != nil {
		raw, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}
	request, err := http.NewRequestWithContext(
		ctx,
		method,
		fmt.Sprintf("https://api.cloudflare.com/client/v4/accounts/%s%s", c.accountID, path),
		body,
	)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+c.apiToken)
	request.Header.Set("Content-Type", "application/json")

	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("cloudflare stream returned %s: %s", response.Status, string(raw))
	}
	if target != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, target); err != nil {
			return err
		}
	}
	return nil
}

func apiError(items []struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}) error {
	if len(items) == 0 {
		return errors.New("cloudflare stream returned an empty result")
	}
	return fmt.Errorf("cloudflare stream error %d: %s", items[0].Code, items[0].Message)
}
