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
	"runtime/debug"
	"strings"
	"time"

	"github.com/balabek1971-sketch/Kolesa/backend/internal/auth"
	"github.com/balabek1971-sketch/Kolesa/backend/internal/authhook"
	"github.com/balabek1971-sketch/Kolesa/backend/internal/config"
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
	}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", server.health)
	mux.HandleFunc("GET /readyz", server.ready)
	mux.HandleFunc("GET /v1/status", server.status)
	mux.Handle("GET /v1/me", server.requireUser(http.HandlerFunc(server.me)))
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
