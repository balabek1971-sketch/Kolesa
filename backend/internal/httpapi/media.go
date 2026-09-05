package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/balabek1971-sketch/Kolesa/backend/internal/repository"
)

const (
	maxPhotoBytes = 15 << 20
	maxVideoBytes = 200 << 20
)

var photoExtensions = map[string]string{
	"image/jpeg": ".jpg",
	"image/png":  ".png",
	"image/webp": ".webp",
	"image/avif": ".avif",
}

var videoExtensions = map[string]string{
	"video/mp4":       ".mp4",
	"video/webm":      ".webm",
	"video/quicktime": ".mov",
}

type mediaUploadRequest struct {
	ContentType        string `json:"content_type"`
	Filename           string `json:"filename"`
	SizeBytes          int64  `json:"size_bytes"`
	SortOrder          int    `json:"sort_order"`
	MaxDurationSeconds int    `json:"max_duration_seconds"`
}

type mediaCompleteRequest struct {
	UploadID        string `json:"upload_id"`
	ProviderAssetID string `json:"provider_asset_id"`
}

func (s *Server) createPhotoUpload(w http.ResponseWriter, r *http.Request) {
	claims, ok := claimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if !s.r2.Configured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "photo_storage_not_configured"})
		return
	}

	listingID := r.PathValue("listingID")
	if !s.requireEditableListing(w, r, listingID, claims.Subject) {
		return
	}

	var payload mediaUploadRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		return
	}
	extension, allowed := photoExtensions[strings.ToLower(payload.ContentType)]
	if !allowed || payload.SizeBytes < 1 || payload.SizeBytes > maxPhotoBytes || payload.SortOrder < 0 || payload.SortOrder > 19 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_photo"})
		return
	}

	objectKey := fmt.Sprintf(
		"listings/%s/%s/%02d-%s%s",
		claims.Subject,
		listingID,
		payload.SortOrder,
		newRequestID(),
		extension,
	)
	expiresAt := time.Now().UTC().Add(15 * time.Minute)
	intent, err := s.repository.CreatePhotoIntent(
		r.Context(),
		listingID,
		claims.Subject,
		objectKey,
		payload.ContentType,
		payload.SizeBytes,
		payload.SortOrder,
		expiresAt,
	)
	if err != nil {
		s.logger.Error("photo upload intent failed", "error", err, "listing_id", listingID)
		writeJSON(w, http.StatusConflict, map[string]string{"error": "photo_slot_unavailable"})
		return
	}

	uploadURL, err := s.r2.PresignPut(objectKey, payload.ContentType, 15*time.Minute)
	if err != nil {
		s.logger.Error("r2 presign failed", "error", err, "listing_id", listingID)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "photo_upload_unavailable"})
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"media_id":   intent.MediaID,
		"upload_id":  intent.ID,
		"upload_url": uploadURL,
		"expires_at": expiresAt.Format(time.RFC3339),
	})
}

func (s *Server) createVideoUpload(w http.ResponseWriter, r *http.Request) {
	claims, ok := claimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if !s.stream.Configured() && !s.r2.Configured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "video_storage_not_configured"})
		return
	}

	listingID := r.PathValue("listingID")
	if !s.requireEditableListing(w, r, listingID, claims.Subject) {
		return
	}

	var payload mediaUploadRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		return
	}
	extension, allowed := videoExtensions[strings.ToLower(payload.ContentType)]
	if !allowed ||
		payload.SizeBytes < 1 ||
		payload.SizeBytes > maxVideoBytes ||
		payload.MaxDurationSeconds < 1 ||
		payload.MaxDurationSeconds > 60 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_video"})
		return
	}

	if s.stream.Configured() {
		upload, err := s.stream.CreateDirectUpload(r.Context(), claims.Subject, map[string]string{
			"listing_id": listingID,
			"owner_id":   claims.Subject,
		})
		if err != nil {
			s.logger.Error("stream direct upload failed", "error", err, "listing_id", listingID)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "video_upload_unavailable"})
			return
		}
		media, err := s.repository.CreateStreamVideoIntent(
			r.Context(), listingID, upload.UID, payload.ContentType, payload.SizeBytes,
		)
		if err != nil {
			_ = s.stream.DeleteVideo(r.Context(), upload.UID)
			s.logger.Error("stream video intent failed", "error", err, "listing_id", listingID)
			writeJSON(w, http.StatusConflict, map[string]string{"error": "video_slot_unavailable"})
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{
			"media_id":          media.ID,
			"provider":          "cloudflare_stream",
			"provider_asset_id": upload.UID,
			"upload_url":        upload.UploadURL,
			"upload_method":     http.MethodPost,
			"expires_at":        upload.ExpiresAt.Format(time.RFC3339),
		})
		return
	}

	objectKey := fmt.Sprintf(
		"listings/%s/%s/video-%s%s",
		claims.Subject,
		listingID,
		newRequestID(),
		extension,
	)
	expiresAt := time.Now().UTC().Add(15 * time.Minute)
	intent, err := s.repository.CreateVideoIntent(
		r.Context(),
		listingID,
		claims.Subject,
		objectKey,
		payload.ContentType,
		payload.SizeBytes,
		expiresAt,
	)
	if err != nil {
		s.logger.Error("video upload intent failed", "error", err, "listing_id", listingID)
		writeJSON(w, http.StatusConflict, map[string]string{"error": "video_slot_unavailable"})
		return
	}

	uploadURL, err := s.r2.PresignPut(objectKey, payload.ContentType, 15*time.Minute)
	if err != nil {
		s.logger.Error("r2 video presign failed", "error", err, "listing_id", listingID)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "video_upload_unavailable"})
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"media_id":      intent.MediaID,
		"upload_id":     intent.ID,
		"provider":      "cloudflare_r2",
		"upload_url":    uploadURL,
		"upload_method": http.MethodPut,
		"expires_at":    expiresAt.Format(time.RFC3339),
	})
}

func (s *Server) completeMediaUpload(w http.ResponseWriter, r *http.Request) {
	claims, ok := claimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	listingID := r.PathValue("listingID")
	mediaID := r.PathValue("mediaID")
	if !s.requireEditableListing(w, r, listingID, claims.Subject) {
		return
	}

	var payload mediaCompleteRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		return
	}
	if payload.UploadID == "" && payload.ProviderAssetID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "upload_reference_required"})
		return
	}

	media, err := s.repository.GetMedia(r.Context(), mediaID, listingID)
	if err != nil {
		status := http.StatusInternalServerError
		if errors.Is(err, repository.ErrNotFound) {
			status = http.StatusNotFound
		}
		writeJSON(w, status, map[string]string{"error": "media_not_found"})
		return
	}

	switch media.Provider {
	case "cloudflare_r2":
		if payload.UploadID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "upload_id_required"})
			return
		}
		info, err := s.r2.HeadObject(r.Context(), media.ObjectKey)
		if err != nil {
			s.logger.Warn("r2 object verification failed", "error", err, "media_id", mediaID)
			writeJSON(w, http.StatusConflict, map[string]string{"error": "media_not_uploaded"})
			return
		}
		if info.SizeBytes < 1 || info.SizeBytes > media.SizeBytes ||
			!strings.EqualFold(strings.TrimSpace(info.ContentType), strings.TrimSpace(media.MimeType)) {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "media_metadata_mismatch"})
			return
		}
		if err := s.repository.CompleteR2Media(r.Context(), mediaID, payload.UploadID, info.SizeBytes, info.ContentType); err != nil {
			s.logger.Error("r2 media completion failed", "error", err, "media_id", mediaID)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "media_completion_failed"})
			return
		}
	case "cloudflare_stream":
		if payload.ProviderAssetID == "" || payload.ProviderAssetID != media.ProviderAssetID {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "provider_asset_id_required"})
			return
		}
		video, err := s.stream.GetVideo(r.Context(), media.ProviderAssetID)
		if err != nil {
			s.logger.Warn("stream video status unavailable", "error", err, "media_id", mediaID)
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "video_status_unavailable"})
			return
		}
		if err := s.updateStreamMedia(r.Context(), video); err != nil {
			s.logger.Error("stream media completion failed", "error", err, "media_id", mediaID)
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "media_completion_failed"})
			return
		}
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported_media_provider"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "accepted"})
}

func (s *Server) getMediaStatus(w http.ResponseWriter, r *http.Request) {
	claims, ok := claimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	listingID := r.PathValue("listingID")
	mediaID := r.PathValue("mediaID")
	if !s.requireEditableListing(w, r, listingID, claims.Subject) {
		return
	}
	media, err := s.repository.GetMedia(r.Context(), mediaID, listingID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "media_not_found"})
		return
	}
	if media.Provider != "cloudflare_stream" {
		writeJSON(w, http.StatusOK, map[string]string{"status": media.Status})
		return
	}
	video, err := s.stream.GetVideo(r.Context(), media.ProviderAssetID)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "video_status_unavailable"})
		return
	}
	if err := s.updateStreamMedia(r.Context(), video); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "media_status_update_failed"})
		return
	}
	status := "processing"
	if video.ReadyToStream {
		status = "ready"
	} else if video.Status.State == "error" {
		status = "failed"
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": status})
}

func (s *Server) requireEditableListing(w http.ResponseWriter, r *http.Request, listingID, ownerID string) bool {
	if listingID == "" || filepath.Base(listingID) != listingID {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_listing_id"})
		return false
	}
	owns, err := s.repository.OwnsEditableListing(r.Context(), listingID, ownerID)
	if err != nil {
		s.logger.Error("listing ownership check failed", "error", err, "listing_id", listingID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "ownership_check_failed"})
		return false
	}
	if !owns {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "listing_not_found"})
		return false
	}
	return true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_json"})
		return err
	}
	return nil
}
