package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"runtime/debug"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/balabek1971-sketch/Kolesa/backend/internal/auth"
	"github.com/balabek1971-sketch/Kolesa/backend/internal/authhook"
	"github.com/balabek1971-sketch/Kolesa/backend/internal/config"
	"github.com/balabek1971-sketch/Kolesa/backend/internal/push"
	"github.com/balabek1971-sketch/Kolesa/backend/internal/r2"
	"github.com/balabek1971-sketch/Kolesa/backend/internal/repository"
	"github.com/balabek1971-sketch/Kolesa/backend/internal/sms"
	cloudflarestream "github.com/balabek1971-sketch/Kolesa/backend/internal/stream"
)

type contextKey string

const claimsContextKey contextKey = "auth-claims"

type Server struct {
	config       config.Config
	logger       *slog.Logger
	verifier     *auth.Verifier
	hookVerifier *authhook.Verifier
	replayGuard  *authhook.ReplayGuard
	smsSender    sms.Sender
	repository   *repository.Client
	r2           *r2.Client
	stream       *cloudflarestream.Client
	pushSender   push.Sender
}

type pushSubscriptionPayload struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256DH string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

type sendSMSHookPayload struct {
	User struct {
		Phone string `json:"phone"`
	} `json:"user"`
	SMS struct {
		OTP string `json:"otp"`
	} `json:"sms"`
}

func New(cfg config.Config, logger *slog.Logger) (http.Handler, error) {
	var hookVerifier *authhook.Verifier
	if cfg.SupabaseAuthHookSecret != "" {
		var err error
		hookVerifier, err = authhook.NewVerifier(cfg.SupabaseAuthHookSecret, 5*time.Minute)
		if err != nil {
			return nil, err
		}
	}

	var smsSender sms.Sender
	switch cfg.SMSProvider {
	case "mobizon":
		if cfg.MobizonAPIKey != "" {
			smsSender = sms.NewMobizon(cfg.MobizonAPIBaseURL, cfg.MobizonAPIKey, cfg.MobizonSender, nil)
		}
	case "autocall":
		if cfg.AutoCallAPIToken != "" {
			smsSender = sms.NewAutoCall(cfg.AutoCallAPIBaseURL, cfg.AutoCallAPIToken, nil)
		}
	}

	return newHandler(cfg, logger, hookVerifier, smsSender), nil
}

func newHandler(cfg config.Config, logger *slog.Logger, hookVerifier *authhook.Verifier, smsSender sms.Sender) http.Handler {
	server := &Server{
		config:       cfg,
		logger:       logger,
		verifier:     auth.NewVerifier(cfg.SupabaseURL, cfg.SupabaseJWTAudience, nil),
		hookVerifier: hookVerifier,
		replayGuard:  authhook.NewReplayGuard(5 * time.Minute),
		smsSender:    smsSender,
		repository:   repository.New(cfg.SupabaseURL, cfg.SupabaseServiceRoleKey, nil),
		r2:           r2.New(cfg.R2AccountID, cfg.R2AccessKeyID, cfg.R2SecretAccessKey, cfg.R2PublicBucket, nil),
		stream:       cloudflarestream.New(cfg.CloudflareStreamAccountID, cfg.CloudflareStreamAPIToken, cfg.CloudflareStreamWebhookSecret, nil),
		pushSender:   push.New(cfg.WebPushVAPIDPublicKey, cfg.WebPushVAPIDPrivateKey, cfg.WebPushVAPIDSubject, &http.Client{Timeout: 8 * time.Second}),
	}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", server.health)
	mux.HandleFunc("GET /readyz", server.ready)
	mux.HandleFunc("GET /v1/status", server.status)
	mux.Handle("GET /v1/me", server.requireUser(http.HandlerFunc(server.me)))
	mux.HandleFunc("GET /v1/push/public-key", server.pushPublicKey)
	mux.Handle("POST /v1/push/subscriptions", server.requireUser(http.HandlerFunc(server.savePushSubscription)))
	mux.Handle("DELETE /v1/push/subscriptions", server.requireUser(http.HandlerFunc(server.deletePushSubscription)))
	mux.Handle("POST /v1/messages/{messageID}/push", server.requireUser(http.HandlerFunc(server.sendMessagePush)))
	mux.Handle("POST /v1/listings/{listingID}/media/photos/upload-url", server.requireUser(http.HandlerFunc(server.createPhotoUpload)))
	mux.Handle("POST /v1/listings/{listingID}/media/video/upload-url", server.requireUser(http.HandlerFunc(server.createVideoUpload)))
	mux.Handle("POST /v1/listings/{listingID}/media/{mediaID}/complete", server.requireUser(http.HandlerFunc(server.completeMediaUpload)))
	mux.Handle("GET /v1/listings/{listingID}/media/{mediaID}/status", server.requireUser(http.HandlerFunc(server.getMediaStatus)))
	mux.HandleFunc("POST /v1/hooks/supabase/send-sms", server.sendSMSHook)
	mux.HandleFunc("POST /v1/hooks/cloudflare/stream", server.streamWebhook)

	return server.recoverPanic(
		server.securityHeaders(
			server.cors(
				server.requestLogger(
					server.requestID(mux),
				),
			),
		),
	)
}

func (s *Server) pushPublicKey(w http.ResponseWriter, _ *http.Request) {
	enabled := s.config.WebPushVAPIDPublicKey != "" && s.config.WebPushVAPIDPrivateKey != ""
	w.Header().Set("Cache-Control", "public, max-age=3600")
	writeJSON(w, http.StatusOK, map[string]any{"enabled": enabled, "public_key": s.config.WebPushVAPIDPublicKey})
}

func (s *Server) savePushSubscription(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFromContext(r.Context())
	var payload pushSubscriptionPayload
	if err := decodeJSON(w, r, &payload); err != nil {
		return
	}
	if !validPushSubscription(payload) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_push_subscription"})
		return
	}
	if err := s.repository.UpsertPushSubscription(
		r.Context(), claims.Subject, payload.Endpoint, payload.Keys.P256DH, payload.Keys.Auth, truncateRunes(r.UserAgent(), 512),
	); err != nil {
		s.logger.Error("push subscription save failed", "error", err, "user_id", claims.Subject)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "subscription_save_failed"})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]bool{"subscribed": true})
}

func (s *Server) deletePushSubscription(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFromContext(r.Context())
	var payload struct {
		Endpoint string `json:"endpoint"`
	}
	if err := decodeJSON(w, r, &payload); err != nil {
		return
	}
	if payload.Endpoint == "" || len(payload.Endpoint) > 2048 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_push_subscription"})
		return
	}
	if err := s.repository.DeletePushSubscription(r.Context(), claims.Subject, payload.Endpoint); err != nil {
		s.logger.Error("push subscription delete failed", "error", err, "user_id", claims.Subject)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "subscription_delete_failed"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) sendMessagePush(w http.ResponseWriter, r *http.Request) {
	claims, _ := claimsFromContext(r.Context())
	message, err := s.repository.GetMessageNotification(r.Context(), r.PathValue("messageID"))
	if errors.Is(err, repository.ErrNotFound) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "message_not_found"})
		return
	}
	if err != nil {
		s.logger.Error("push message lookup failed", "error", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "message_lookup_failed"})
		return
	}
	if message.SenderID != claims.Subject {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "message_sender_mismatch"})
		return
	}

	subscriptions, err := s.repository.ListPushSubscriptions(r.Context(), message.RecipientID)
	if err != nil {
		s.logger.Error("push subscriptions lookup failed", "error", err, "recipient_id", message.RecipientID)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "subscription_lookup_failed"})
		return
	}

	notification := push.Notification{
		Title: "Новое сообщение · " + truncateRunes(message.ListingTitle, 60),
		Body:  truncateRunes(message.Body, 160),
		URL:   "/#/messages/" + message.ConversationID,
		Tag:   "conversation-" + message.ConversationID,
		Badge: 1,
	}
	sent, failed := 0, 0
	for _, subscription := range subscriptions {
		claimed, claimErr := s.repository.ClaimPushDelivery(r.Context(), message.MessageID, subscription.ID)
		if claimErr != nil {
			failed++
			s.logger.Error("push delivery claim failed", "error", claimErr, "message_id", message.MessageID)
			continue
		}
		if !claimed {
			continue
		}
		result, sendErr := s.pushSender.Send(r.Context(), push.Subscription{
			Endpoint: subscription.Endpoint, P256DH: subscription.P256DH, Auth: subscription.AuthSecret,
		}, notification)
		if sendErr != nil {
			failed++
			if result.StatusCode == http.StatusNotFound || result.StatusCode == http.StatusGone {
				_ = s.repository.DeletePushSubscriptionByID(r.Context(), subscription.ID)
			} else {
				_ = s.repository.ReleasePushDelivery(r.Context(), message.MessageID, subscription.ID)
			}
			s.logger.Warn("push delivery failed", "error", sendErr, "status", result.StatusCode, "message_id", message.MessageID)
			continue
		}
		sent++
		if err := s.repository.CompletePushDelivery(r.Context(), message.MessageID, subscription.ID, result.StatusCode); err != nil {
			s.logger.Warn("push delivery receipt update failed", "error", err, "message_id", message.MessageID)
		}
	}
	writeJSON(w, http.StatusAccepted, map[string]int{"sent": sent, "failed": failed})
}

func validPushSubscription(value pushSubscriptionPayload) bool {
	if len(value.Endpoint) < 20 || len(value.Endpoint) > 2048 || len(value.Keys.P256DH) < 40 || len(value.Keys.P256DH) > 256 || len(value.Keys.Auth) < 16 || len(value.Keys.Auth) > 128 {
		return false
	}
	parsed, err := url.Parse(value.Endpoint)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "fcm.googleapis.com" || host == "updates.push.services.mozilla.com" || host == "web.push.apple.com" ||
		strings.HasSuffix(host, ".push.apple.com") || strings.HasSuffix(host, ".notify.windows.com")
}

func truncateRunes(value string, maximum int) string {
	if utf8.RuneCountInString(value) <= maximum {
		return value
	}
	runes := []rune(value)
	return string(runes[:maximum-1]) + "…"
}

func (s *Server) sendSMSHook(w http.ResponseWriter, r *http.Request) {
	if s.hookVerifier == nil || s.smsSender == nil {
		writeHookError(w, http.StatusServiceUnavailable, "SMS delivery is not configured")
		return
	}

	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
	if err != nil {
		writeHookError(w, http.StatusBadRequest, "Invalid hook payload")
		return
	}

	headers := authhook.Headers{
		ID:        r.Header.Get("webhook-id"),
		Timestamp: r.Header.Get("webhook-timestamp"),
		Signature: r.Header.Get("webhook-signature"),
	}
	if err := s.hookVerifier.Verify(body, headers); err != nil {
		s.logger.Warn("Supabase SMS hook signature rejected",
			"error", err,
			"webhook_id", headers.ID,
		)
		writeHookError(w, http.StatusUnauthorized, "Invalid hook signature")
		return
	}

	if !s.replayGuard.Claim(headers.ID) {
		writeHookSuccess(w)
		return
	}

	var payload sendSMSHookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		s.replayGuard.Release(headers.ID)
		writeHookError(w, http.StatusBadRequest, "Invalid hook payload")
		return
	}

	result, err := s.smsSender.SendOTP(r.Context(), payload.User.Phone, payload.SMS.OTP)
	if err != nil {
		s.replayGuard.Release(headers.ID)
		s.logger.Error("SMS delivery failed",
			"error", err,
			"webhook_id", headers.ID,
		)
		writeHookError(w, http.StatusBadGateway, "SMS provider rejected the message")
		return
	}

	s.logger.Info("SMS accepted by provider",
		"provider", result.Provider,
		"message_id", result.MessageID,
		"webhook_id", headers.ID,
	)
	writeHookSuccess(w)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	claims, ok := claimsFromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"id":         claims.Subject,
		"email":      claims.Email,
		"phone":      claims.Phone,
		"session_id": claims.SessionID,
	})
}

func (s *Server) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r.Header.Get("Authorization"))
		if token == "" {
			if cookie, err := r.Cookie("qazauto_access_token"); err == nil {
				token = cookie.Value
			}
		}
		if token == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}

		claims, err := s.verifier.Verify(r.Context(), token)
		if err != nil {
			code := "invalid_access_token"
			if errors.Is(err, auth.ErrExpiredToken) {
				code = "expired_access_token"
			}
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": code})
			return
		}

		ctx := context.WithValue(r.Context(), claimsContextKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func claimsFromContext(ctx context.Context) (auth.Claims, bool) {
	claims, ok := ctx.Value(claimsContextKey).(auth.Claims)
	return claims, ok
}

func bearerToken(value string) string {
	scheme, token, found := strings.Cut(value, " ")
	if !found || !strings.EqualFold(scheme, "Bearer") || token == "" || strings.Contains(token, " ") {
		return ""
	}
	return token
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) ready(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (s *Server) status(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"service":     "qazauto-api",
		"environment": s.config.Environment,
		"version":     "0.1.0",
	})
}

func (s *Server) requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-Request-ID")
		if requestID == "" || len(requestID) > 128 {
			requestID = newRequestID()
		}
		w.Header().Set("X-Request-ID", requestID)
		next.ServeHTTP(w, r)
	})
}

func (s *Server) requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		next.ServeHTTP(w, r)
		s.logger.Info("request completed",
			"method", r.Method,
			"path", r.URL.Path,
			"duration_ms", time.Since(started).Milliseconds(),
			"request_id", w.Header().Get("X-Request-ID"),
		)
	})
}

func (s *Server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && origin != s.config.WebOrigin {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "origin_not_allowed"})
			return
		}

		if origin == s.config.WebOrigin {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-CSRF-Token, X-Request-ID")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Add("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

func (s *Server) recoverPanic(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if recovered := recover(); recovered != nil {
				s.logger.Error("panic recovered", "error", recovered, "stack", string(debug.Stack()))
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal_error"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		return
	}
}

func writeHookError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{
		"error": map[string]any{
			"http_code": status,
			"message":   message,
		},
	})
}

func writeHookSuccess(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("{}"))
}

func newRequestID() string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		return hex.EncodeToString([]byte(time.Now().UTC().Format(time.RFC3339Nano)))
	}
	return hex.EncodeToString(buffer)
}
