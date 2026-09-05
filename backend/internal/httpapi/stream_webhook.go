package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/balabek1971-sketch/Kolesa/backend/internal/repository"
	cloudflarestream "github.com/balabek1971-sketch/Kolesa/backend/internal/stream"
)

func (s *Server) streamWebhook(w http.ResponseWriter, r *http.Request) {
	if !s.stream.WebhookConfigured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "stream_webhook_not_configured"})
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 2<<20))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_webhook_body"})
		return
	}
	if err := s.stream.VerifyWebhook(r.Header.Get("Webhook-Signature"), body, time.Now().UTC()); err != nil {
		s.logger.Warn("stream webhook rejected", "error", err)
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid_webhook_signature"})
		return
	}
	var video cloudflarestream.Video
	if err := json.Unmarshal(body, &video); err != nil || video.UID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_webhook_payload"})
		return
	}
	if err := s.updateStreamMedia(r.Context(), video); err != nil {
		s.logger.Error("stream webhook update failed", "error", err, "stream_uid", video.UID)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "media_status_update_failed"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) updateStreamMedia(ctx context.Context, video cloudflarestream.Video) error {
	status := "processing"
	reason := ""
	if video.ReadyToStream {
		status = "ready"
	} else if strings.EqualFold(video.Status.State, "error") {
		status = "failed"
		reason = strings.TrimSpace(video.Status.ErrorReasonText)
		if reason == "" {
			reason = strings.TrimSpace(video.Status.ErrorReasonCode)
		}
	}
	return s.repository.UpdateStreamMediaByAsset(ctx, video.UID, repository.StreamMediaUpdate{
		Status:           status,
		DurationSeconds:  video.Duration,
		Width:            video.Input.Width,
		Height:           video.Input.Height,
		HLSURL:           video.Playback.HLS,
		DASHURL:          video.Playback.DASH,
		ThumbnailURL:     video.Thumbnail,
		ModerationReason: reason,
	})
}
