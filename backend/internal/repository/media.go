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
	Kind            string `json:"kind"`
	Provider        string `json:"provider"`
	ObjectKey       string `json:"object_key"`
	ProviderAssetID string `json:"provider_asset_id"`
	MimeType        string `json:"mime_type"`
	SizeBytes       int64  `json:"size_bytes"`
	Status          string `json:"status"`
	SortOrder       int    `json:"sort_order"`
	CreatedAt       string `json:"created_at"`
}

type StreamMediaUpdate struct {
	Status           string
	DurationSeconds  float64
	Width            int
	Height           int
	HLSURL           string
	DASHURL          string
	ThumbnailURL     string
	ModerationReason string
}

type UploadIntent struct {
	ID              string
	MediaID         string
	ObjectKey       string
	AlreadyComplete bool
}

type ListingMediaManifest struct {
	Status             string
	ExpectedPhotoCount int
	ExpectsVideo       bool
	ReadyPhotoCount    int
	ReadyVideoCount    int
}

type ModerationMedia struct {
	ID              string            `json:"id"`
	Kind            string            `json:"kind"`
	Provider        string            `json:"provider"`
	ObjectKey       string            `json:"object_key"`
	ProviderAssetID string            `json:"provider_asset_id"`
	Variants        map[string]string `json:"variants"`
	Status          string            `json:"status"`
	SortOrder       int               `json:"sort_order"`
	MimeType        string            `json:"mime_type"`
	DurationSeconds float64           `json:"duration_seconds"`
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

	var rows []struct {
		ID string `json:"id"`
	}
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
	existing, err := c.GetMediaSlot(ctx, listingID, "photo", sortOrder)
	if err == nil {
		return c.resumeR2Intent(ctx, existing, ownerID, mimeType, sizeBytes, expiresAt)
	}
	if !errors.Is(err, ErrNotFound) {
		return UploadIntent{}, err
	}

	media, err := c.insertMedia(ctx, map[string]any{
		"listing_id": listingID,
		"kind":       "photo",
		"provider":   "cloudflare_r2",
		"object_key": objectKey,
		"status":     "pending_upload",
		"sort_order": sortOrder,
		"mime_type":  mimeType,
		"size_bytes": sizeBytes,
	})
	if err != nil {
		existing, lookupErr := c.GetMediaSlot(ctx, listingID, "photo", sortOrder)
		if lookupErr != nil {
			return UploadIntent{}, err
		}
		return c.resumeR2Intent(ctx, existing, ownerID, mimeType, sizeBytes, expiresAt)
	}
	return c.ensureR2Upload(ctx, media, ownerID, mimeType, sizeBytes, expiresAt)
}

func (c *Client) CreateVideoIntent(
	ctx context.Context,
	listingID, ownerID, objectKey, mimeType string,
	sizeBytes int64,
	expiresAt time.Time,
) (UploadIntent, error) {
	existing, err := c.GetMediaSlot(ctx, listingID, "video", 0)
	if err == nil {
		return c.resumeR2Intent(ctx, existing, ownerID, mimeType, sizeBytes, expiresAt)
	}
	if !errors.Is(err, ErrNotFound) {
		return UploadIntent{}, err
	}

	media, err := c.insertMedia(ctx, map[string]any{
		"listing_id": listingID,
		"kind":       "video",
		"provider":   "cloudflare_r2",
		"object_key": objectKey,
		"status":     "pending_upload",
		"sort_order": 0,
		"mime_type":  mimeType,
		"size_bytes": sizeBytes,
	})
	if err != nil {
		existing, lookupErr := c.GetMediaSlot(ctx, listingID, "video", 0)
		if lookupErr != nil {
			return UploadIntent{}, err
		}
		return c.resumeR2Intent(ctx, existing, ownerID, mimeType, sizeBytes, expiresAt)
	}
	return c.ensureR2Upload(ctx, media, ownerID, mimeType, sizeBytes, expiresAt)
}

func (c *Client) resumeR2Intent(
	ctx context.Context,
	media Media,
	ownerID, mimeType string,
	sizeBytes int64,
	expiresAt time.Time,
) (UploadIntent, error) {
	if media.Provider != "cloudflare_r2" || media.ObjectKey == "" {
		return UploadIntent{}, errors.New("media slot uses another provider")
	}
	if media.Status == "ready" {
		return UploadIntent{
			MediaID:         media.ID,
			ObjectKey:       media.ObjectKey,
			AlreadyComplete: true,
		}, nil
	}
	if err := c.patch(ctx, "/listing_media?id=eq."+url.QueryEscape(media.ID), map[string]any{
		"status":            "pending_upload",
		"mime_type":         mimeType,
		"size_bytes":        sizeBytes,
		"moderation_reason": nil,
	}); err != nil {
		return UploadIntent{}, err
	}
	return c.ensureR2Upload(ctx, media, ownerID, mimeType, sizeBytes, expiresAt)
}

func (c *Client) ensureR2Upload(
	ctx context.Context,
	media Media,
	ownerID, mimeType string,
	sizeBytes int64,
	expiresAt time.Time,
) (UploadIntent, error) {
	upload, err := c.getOpenUpload(ctx, media.ID)
	if err == nil {
		if patchErr := c.patch(ctx, "/media_uploads?id=eq."+url.QueryEscape(upload.ID), map[string]any{
			"expected_mime_type": mimeType,
			"max_size_bytes":     sizeBytes,
			"expires_at":         expiresAt.UTC().Format(time.RFC3339),
		}); patchErr != nil {
			return UploadIntent{}, patchErr
		}
		upload.ObjectKey = media.ObjectKey
		return upload, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return UploadIntent{}, err
	}

	uploadID, err := c.insertUpload(ctx, map[string]any{
		"listing_id":         media.ListingID,
		"owner_id":           ownerID,
		"media_id":           media.ID,
		"object_key":         media.ObjectKey,
		"expected_mime_type": mimeType,
		"max_size_bytes":     sizeBytes,
		"expires_at":         expiresAt.UTC().Format(time.RFC3339),
	})
	if err != nil {
		upload, lookupErr := c.getOpenUpload(ctx, media.ID)
		if lookupErr != nil {
			return UploadIntent{}, err
		}
		return upload, nil
	}
	return UploadIntent{ID: uploadID, MediaID: media.ID, ObjectKey: media.ObjectKey}, nil
}

func (c *Client) CreateStreamVideoIntent(
	ctx context.Context,
	listingID, providerAssetID, mimeType string,
	sizeBytes int64,
) (Media, error) {
	return c.insertMedia(ctx, map[string]any{
		"listing_id":        listingID,
		"kind":              "video",
		"provider":          "cloudflare_stream",
		"provider_asset_id": providerAssetID,
		"status":            "pending_upload",
		"sort_order":        0,
		"mime_type":         mimeType,
		"size_bytes":        sizeBytes,
	})
}

func (c *Client) GetMedia(ctx context.Context, mediaID, listingID string) (Media, error) {
	query := url.Values{}
	query.Set("id", "eq."+mediaID)
	query.Set("listing_id", "eq."+listingID)
	query.Set("deleted_at", "is.null")
	query.Set("select", "id,listing_id,kind,provider,object_key,provider_asset_id,mime_type,size_bytes,status,sort_order,created_at")
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

func (c *Client) GetMediaSlot(ctx context.Context, listingID, kind string, sortOrder int) (Media, error) {
	query := url.Values{}
	query.Set("listing_id", "eq."+listingID)
	query.Set("kind", "eq."+kind)
	query.Set("deleted_at", "is.null")
	query.Set("select", "id,listing_id,kind,provider,object_key,provider_asset_id,mime_type,size_bytes,status,sort_order,created_at")
	query.Set("limit", "1")
	if kind == "photo" {
		query.Set("sort_order", "eq."+strconv.Itoa(sortOrder))
	}

	var rows []Media
	if err := c.get(ctx, "/listing_media?"+query.Encode(), &rows); err != nil {
		return Media{}, err
	}
	if len(rows) != 1 {
		return Media{}, ErrNotFound
	}
	return rows[0], nil
}

func (c *Client) getOpenUpload(ctx context.Context, mediaID string) (UploadIntent, error) {
	query := url.Values{}
	query.Set("media_id", "eq."+mediaID)
	query.Set("completed_at", "is.null")
	query.Set("select", "id,media_id,object_key")
	query.Set("order", "created_at.desc")
	query.Set("limit", "1")

	var rows []struct {
		ID        string `json:"id"`
		MediaID   string `json:"media_id"`
		ObjectKey string `json:"object_key"`
	}
	if err := c.get(ctx, "/media_uploads?"+query.Encode(), &rows); err != nil {
		return UploadIntent{}, err
	}
	if len(rows) != 1 {
		return UploadIntent{}, ErrNotFound
	}
	return UploadIntent{ID: rows[0].ID, MediaID: rows[0].MediaID, ObjectKey: rows[0].ObjectKey}, nil
}

func (c *Client) GetOwnedListingMediaManifest(ctx context.Context, listingID, ownerID string) (ListingMediaManifest, error) {
	query := url.Values{}
	query.Set("id", "eq."+listingID)
	query.Set("owner_id", "eq."+ownerID)
	query.Set("deleted_at", "is.null")
	query.Set("select", "status,expected_photo_count,expects_video")
	query.Set("limit", "1")

	var listings []struct {
		Status             string `json:"status"`
		ExpectedPhotoCount int    `json:"expected_photo_count"`
		ExpectsVideo       bool   `json:"expects_video"`
	}
	if err := c.get(ctx, "/listings?"+query.Encode(), &listings); err != nil {
		return ListingMediaManifest{}, err
	}
	if len(listings) != 1 {
		return ListingMediaManifest{}, ErrNotFound
	}

	mediaQuery := url.Values{}
	mediaQuery.Set("listing_id", "eq."+listingID)
	mediaQuery.Set("status", "eq.ready")
	mediaQuery.Set("deleted_at", "is.null")
	mediaQuery.Set("select", "kind")
	var media []struct {
		Kind string `json:"kind"`
	}
	if err := c.get(ctx, "/listing_media?"+mediaQuery.Encode(), &media); err != nil {
		return ListingMediaManifest{}, err
	}

	manifest := ListingMediaManifest{
		Status:             listings[0].Status,
		ExpectedPhotoCount: listings[0].ExpectedPhotoCount,
		ExpectsVideo:       listings[0].ExpectsVideo,
	}
	for _, item := range media {
		switch item.Kind {
		case "photo":
			manifest.ReadyPhotoCount++
		case "video":
			manifest.ReadyVideoCount++
		}
	}
	return manifest, nil
}

func (c *Client) UpdateStreamMediaByAsset(ctx context.Context, providerAssetID string, update StreamMediaUpdate) error {
	value := map[string]any{
		"status": update.Status,
		"variants": map[string]string{
			"hls":       update.HLSURL,
			"dash":      update.DASHURL,
			"thumbnail": update.ThumbnailURL,
		},
	}
	if update.DurationSeconds > 0 {
		value["duration_seconds"] = update.DurationSeconds
	}
	if update.Width > 0 {
		value["width"] = update.Width
	}
	if update.Height > 0 {
		value["height"] = update.Height
	}
	if update.ModerationReason != "" {
		value["moderation_reason"] = update.ModerationReason
	}
	return c.patch(ctx, "/listing_media?provider=eq.cloudflare_stream&provider_asset_id=eq."+url.QueryEscape(providerAssetID), value)
}

func (c *Client) SoftDeleteMedia(ctx context.Context, mediaID string) error {
	return c.patch(ctx, "/listing_media?id=eq."+url.QueryEscape(mediaID), map[string]any{
		"deleted_at": time.Now().UTC().Format(time.RFC3339),
	})
}

func (c *Client) CompleteR2Media(ctx context.Context, mediaID, uploadID string, sizeBytes int64, mimeType string) error {
	if err := c.patch(ctx, "/listing_media?id=eq."+url.QueryEscape(mediaID), map[string]any{
		"status":     "ready",
		"size_bytes": sizeBytes,
		"mime_type":  mimeType,
	}); err != nil {
		return err
	}
	return c.patch(ctx, "/media_uploads?id=eq."+url.QueryEscape(uploadID), map[string]any{
		"completed_at": time.Now().UTC().Format(time.RFC3339),
	})
}

func (c *Client) QueueListingModeration(ctx context.Context, listingID, ownerID string) (int, error) {
	var revision int
	err := c.requestWithPrefer(ctx, http.MethodPost, "/rpc/queue_listing_for_automated_moderation", map[string]any{
		"p_listing_id": listingID,
		"p_owner_id":   ownerID,
	}, &revision, "return=representation")
	return revision, err
}

func (c *Client) GetOwnedListingStatus(ctx context.Context, listingID, ownerID string) (string, error) {
	query := url.Values{}
	query.Set("id", "eq."+listingID)
	query.Set("owner_id", "eq."+ownerID)
	query.Set("deleted_at", "is.null")
	query.Set("select", "status")
	query.Set("limit", "1")

	var rows []struct {
		Status string `json:"status"`
	}
	if err := c.get(ctx, "/listings?"+query.Encode(), &rows); err != nil {
		return "", err
	}
	if len(rows) != 1 {
		return "", ErrNotFound
	}
	return rows[0].Status, nil
}

func (c *Client) MarkModerationDispatchFailed(ctx context.Context, listingID string, revision int) error {
	return c.request(ctx, http.MethodPost, "/rpc/fail_listing_moderation_dispatch", map[string]any{
		"p_listing_id": listingID,
		"p_revision":   revision,
	}, nil, false)
}

func (c *Client) ClaimListingModeration(ctx context.Context, listingID string, revision int) (bool, error) {
	var claimed bool
	err := c.requestWithPrefer(ctx, http.MethodPost, "/rpc/claim_listing_automated_moderation", map[string]any{
		"p_listing_id": listingID,
		"p_revision":   revision,
	}, &claimed, "return=representation")
	return claimed, err
}

func (c *Client) ListListingModerationMedia(ctx context.Context, listingID string) ([]ModerationMedia, error) {
	query := url.Values{}
	query.Set("listing_id", "eq."+listingID)
	query.Set("deleted_at", "is.null")
	query.Set("select", "id,kind,provider,object_key,provider_asset_id,variants,status,sort_order,mime_type,duration_seconds")
	query.Set("order", "sort_order.asc")
	var media []ModerationMedia
	err := c.get(ctx, "/listing_media?"+query.Encode(), &media)
	return media, err
}

func (c *Client) RetryListingModeration(ctx context.Context, listingID string, revision int, errorCode string) error {
	return c.request(ctx, http.MethodPost, "/rpc/retry_listing_automated_moderation", map[string]any{
		"p_listing_id": listingID,
		"p_revision":   revision,
		"p_error_code": errorCode,
	}, nil, false)
}

func (c *Client) CompleteListingModeration(
	ctx context.Context,
	listingID string,
	revision int,
	approved, photoPassed bool,
	videoPassed *bool,
	reason string,
	result map[string]any,
) error {
	return c.request(ctx, http.MethodPost, "/rpc/complete_listing_automated_moderation", map[string]any{
		"p_listing_id":   listingID,
		"p_revision":     revision,
		"p_approved":     approved,
		"p_photo_passed": photoPassed,
		"p_video_passed": videoPassed,
		"p_reason":       reason,
		"p_result":       result,
	}, nil, false)
}

func (c *Client) FailListingModeration(ctx context.Context, listingID string, revision int, errorCode string) error {
	return c.request(ctx, http.MethodPost, "/rpc/fail_listing_automated_moderation", map[string]any{
		"p_listing_id": listingID,
		"p_revision":   revision,
		"p_error_code": errorCode,
	}, nil, false)
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
	var rows []struct {
		ID string `json:"id"`
	}
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
	prefer := "return=minimal"
	if representation {
		prefer = "return=representation"
	}
	return c.requestWithPrefer(ctx, method, requestPath, body, target, prefer)
}

func (c *Client) requestWithPrefer(ctx context.Context, method, requestPath string, body any, target any, prefer string) error {
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
	request.Header.Set("Prefer", prefer)

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
