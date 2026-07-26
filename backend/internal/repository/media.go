package repository

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var ErrNotFound = errors.New("record not found")

type Client struct {
	baseURL string
	key     string
	http    *http.Client
}

type Media struct {
	ID              string `json:"id"`
	ListingID       string `json:"listing_id"`
	Provider        string `json:"provider"`
	ObjectKey       string `json:"object_key"`
	ProviderAssetID string `json:"provider_asset_id"`
	MimeType        string `json:"mime_type"`
	SizeBytes       int64  `json:"size_bytes"`
}

type UploadIntent struct {
	ID      string
	MediaID string
}

func New(baseURL, serviceRoleKey string, httpClient *http.Client) *Client {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 15 * time.Second}
	}
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/") + "/rest/v1",
		key:     serviceRoleKey,
		http:    httpClient,
	}
}

func (c *Client) OwnsEditableListing(ctx context.Context, listingID, ownerID string) (bool, error) {
	query := url.Values{}
	query.Set("id", "eq."+listingID)
	query.Set("owner_id", "eq."+ownerID)
	query.Set("status", "in.(draft,rejected)")
	query.Set("deleted_at", "is.null")
	query.Set("select", "id")
	query.Set("limit", "1")

	var rows []struct{ ID string `json:"id"` }
	if err := c.get(ctx, "/listings?"+query.Encode(), &rows); err != nil {
		return false, err
	}
	return len(rows) == 1, nil
}

func (c *Client) CreatePhotoIntent(
	ctx context.Context,
	listingID, ownerID, objectKey, mimeType string,
	sizeBytes int64,
	sortOrder int,
	expiresAt time.Time,
) (UploadIntent, error) {
	media, err := c.insertMedia(ctx, map[string]any{
		"listing_id": listingID,
		"kind": "photo",
		"provider": "cloudflare_r2",
		"object_key": objectKey,
		"status": "pending_upload",
		"sort_order": sortOrder,
		"mime_type": mimeType,
		"size_bytes": sizeBytes,
	})
	if err != nil {
		return UploadIntent{}, err
	}

	uploadID, err := c.insertUpload(ctx, map[string]any{
		"listing_id": listingID,
		"owner_id": ownerID,
		"media_id": media.ID,
		"object_key": objectKey,
		"expected_mime_type": mimeType,
		"max_size_bytes": sizeBytes,
		"expires_at": expiresAt.UTC().Format(time.RFC3339),
	})
	if err != nil {
		return UploadIntent{}, err
	}
	return UploadIntent{ID: uploadID, MediaID: media.ID}, nil
}

func (c *Client) CreateVideoIntent(
	ctx context.Context,
	listingID, ownerID, objectKey, mimeType string,
	sizeBytes int64,
	expiresAt time.Time,
) (UploadIntent, error) {
	media, err := c.insertMedia(ctx, map[string]any{
		"listing_id": listingID,
		"kind": "video",
		"provider": "cloudflare_r2",
		"object_key": objectKey,
		"status": "pending_upload",
		"sort_order": 0,
		"mime_type": mimeType,
		"size_bytes": sizeBytes,
	})
	if err != nil {
		return UploadIntent{}, err
	}

	uploadID, err := c.insertUpload(ctx, map[string]any{
		"listing_id": listingID,
		"owner_id": ownerID,
		"media_id": media.ID,
		"object_key": objectKey,
		"expected_mime_type": mimeType,
		"max_size_bytes": sizeBytes,
		"expires_at": expiresAt.UTC().Format(time.RFC3339),
	})
	if err != nil {
		return UploadIntent{}, err
	}
	return UploadIntent{ID: uploadID, MediaID: media.ID}, nil
}

func (c *Client) GetMedia(ctx context.Context, mediaID, listingID string) (Media, error) {
	query := url.Values{}
	query.Set("id", "eq."+mediaID)
	query.Set("listing_id", "eq."+listingID)
	query.Set("deleted_at", "is.null")
	query.Set("select", "id,listing_id,provider,object_key,provider_asset_id,mime_type,size_bytes")
	query.Set("limit", "1")

	var rows []Media
	if err := c.get(ctx, "/listing_media?"+query.Encode(), &rows); err != nil {
		return Media{}, err
	}
	if len(rows) != 1 {
		return Media{}, ErrNotFound
	}
	return rows[0], nil
}

func (c *Client) CompleteR2Media(ctx context.Context, mediaID, uploadID string, sizeBytes int64, mimeType string) error {
	if err := c.patch(ctx, "/listing_media?id=eq."+url.QueryEscape(mediaID), map[string]any{
		"status": "ready",
		"size_bytes": sizeBytes,
		"mime_type": mimeType,
	}); err != nil {
		return err
	}
	return c.patch(ctx, "/media_uploads?id=eq."+url.QueryEscape(uploadID), map[string]any{
		"completed_at": time.Now().UTC().Format(time.RFC3339),
	})
}

func (c *Client) insertMedia(ctx context.Context, value map[string]any) (Media, error) {
	var rows []Media
	if err := c.request(ctx, http.MethodPost, "/listing_media", value, &rows, true); err != nil {
		return Media{}, err
	}
	if len(rows) != 1 {
		return Media{}, errors.New("supabase did not return media")
	}
	return rows[0], nil
}

func (c *Client) insertUpload(ctx context.Context, value map[string]any) (string, error) {
	var rows []struct{ ID string `json:"id"` }
	if err := c.request(ctx, http.MethodPost, "/media_uploads", value, &rows, true); err != nil {
		return "", err
	}
	if len(rows) != 1 {
		return "", errors.New("supabase did not return upload")
	}
	return rows[0].ID, nil
}

func (c *Client) get(ctx context.Context, path string, target any) error {
	return c.request(ctx, http.MethodGet, path, nil, target, false)
}

func (c *Client) patch(ctx context.Context, path string, value map[string]any) error {
	return c.request(ctx, http.MethodPatch, path, value, nil, false)
}

func (c *Client) request(ctx context.Context, method, requestPath string, body any, target any, representation bool) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}

	request, err := http.NewRequestWithContext(ctx, method, c.baseURL+requestPath, reader)
	if err != nil {
		return err
	}
	request.Header.Set("apikey", c.key)
	request.Header.Set("Authorization", "Bearer "+c.key)
	request.Header.Set("Content-Type", "application/json")
	if representation {
		request.Header.Set("Prefer", "return=representation")
	} else {
		request.Header.Set("Prefer", "return=minimal")
	}

	response, err := c.http.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("supabase returned %s: %s", response.Status, string(raw))
	}
	if target != nil && len(raw) > 0 {
		if err := json.Unmarshal(raw, target); err != nil {
			return err
		}
	}
	return nil
}

func ParseSize(value string) int64 {
	size, _ := strconv.ParseInt(value, 10, 64)
	return size
}
