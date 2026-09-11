package httpapi

import (
	"crypto/subtle"
	"net/http"
	"path/filepath"
	"strings"
)

type moderationRevisionRequest struct {
	Revision  int    `json:"revision"`
	ErrorCode string `json:"error_code"`
}

type moderationCompleteRequest struct {
	Revision    int            `json:"revision"`
	Approved    bool           `json:"approved"`
	PhotoPassed bool           `json:"photo_passed"`
	VideoPassed *bool          `json:"video_passed"`
	Reason      string         `json:"reason"`
	Result      map[string]any `json:"result"`
}

func (s *Server) authorizeModerationWorker(w http.ResponseWriter, r *http.Request) bool {
	expected := s.config.ModerationWorkerSecret
	actual := bearerToken(r.Header.Get("Authorization"))
	if expected == "" || len(actual) != len(expected) || subtle.ConstantTimeCompare([]byte(actual), []byte(expected)) != 1 {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return false
	}
	return true
}

func validListingPathID(listingID string) bool {
	return listingID != "" && filepath.Base(listingID) == listingID
}

func (s *Server) publishListing(w http.ResponseWriter, r *http.Request) {
	claims, ok := claimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	listingID := r.PathValue("listingID")
	if !validListingPathID(listingID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_listing_id"})
		return
	}
	if s.moderation == nil || !s.moderation.Configured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error":   "moderation_not_configured",
			"message": "Автоматическая проверка пока не настроена.",
		})
		return
	}
	status, err := s.repository.GetOwnedListingStatus(r.Context(), listingID, claims.Subject)
	if err != nil {
		s.logger.Warn("listing status lookup failed", "error", err, "listing_id", listingID, "owner_id", claims.Subject)
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{
			"error":   "listing_not_ready",
			"message": "Объявление не найдено или недоступно для публикации.",
		})
		return
	}
	if status == "media_processing" || status == "active" {
		writeJSON(w, http.StatusAccepted, map[string]any{"status": status})
		return
	}

	revision, err := s.repository.QueueListingModeration(r.Context(), listingID, claims.Subject)
	if err != nil {
		s.logger.Warn("listing moderation request rejected", "error", err, "listing_id", listingID, "owner_id", claims.Subject)
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{
			"error":   "listing_not_ready",
			"message": "Проверьте данные объявления и дождитесь загрузки фотографий.",
		})
		return
	}

	if err := s.moderation.Enqueue(r.Context(), listingID, revision); err != nil {
		s.logger.Error("listing moderation dispatch failed", "error", err, "listing_id", listingID, "revision", revision)
		if rollbackErr := s.repository.MarkModerationDispatchFailed(r.Context(), listingID, revision); rollbackErr != nil {
			s.logger.Error("listing moderation rollback failed", "error", rollbackErr, "listing_id", listingID, "revision", revision)
		}
		writeJSON(w, http.StatusBadGateway, map[string]string{
			"error":   "moderation_unavailable",
			"message": "Проверка временно недоступна. Попробуйте ещё раз.",
		})
		return
	}

	writeJSON(w, http.StatusAccepted, map[string]any{
		"status":   "media_processing",
		"revision": revision,
	})
}

func (s *Server) claimListingModeration(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeModerationWorker(w, r) {
		return
	}
	var payload moderationRevisionRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		return
	}
	claimed, err := s.repository.ClaimListingModeration(r.Context(), r.PathValue("listingID"), payload.Revision)
	if err != nil {
		s.logger.Error("moderation claim failed", "error", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "claim_failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"claimed": claimed})
}

func (s *Server) listListingModerationMedia(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeModerationWorker(w, r) {
		return
	}
	listingID := r.PathValue("listingID")
	if !validListingPathID(listingID) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_listing_id"})
		return
	}
	media, err := s.repository.ListListingModerationMedia(r.Context(), listingID)
	if err != nil {
		s.logger.Error("moderation media lookup failed", "error", err, "listing_id", listingID)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "media_lookup_failed"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"media": media})
}

func (s *Server) retryListingModeration(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeModerationWorker(w, r) {
		return
	}
	var payload moderationRevisionRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		return
	}
	if err := s.repository.RetryListingModeration(r.Context(), r.PathValue("listingID"), payload.Revision, payload.ErrorCode); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "retry_update_failed"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) completeListingModeration(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeModerationWorker(w, r) {
		return
	}
	var payload moderationCompleteRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		return
	}
	if payload.Revision < 1 || len(payload.Reason) > 1000 || payload.Result == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_result"})
		return
	}
	if err := s.repository.CompleteListingModeration(
		r.Context(), r.PathValue("listingID"), payload.Revision, payload.Approved,
		payload.PhotoPassed, payload.VideoPassed, strings.TrimSpace(payload.Reason), payload.Result,
	); err != nil {
		s.logger.Error("moderation completion failed", "error", err, "listing_id", r.PathValue("listingID"))
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "completion_failed"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) failListingModeration(w http.ResponseWriter, r *http.Request) {
	if !s.authorizeModerationWorker(w, r) {
		return
	}
	var payload moderationRevisionRequest
	if err := decodeJSON(w, r, &payload); err != nil {
		return
	}
	if err := s.repository.FailListingModeration(r.Context(), r.PathValue("listingID"), payload.Revision, payload.ErrorCode); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "failure_update_failed"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
