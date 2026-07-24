package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

type Config struct {
	Environment            string
	Port                   string
	WebOrigin              string
	SupabaseURL            string
	SupabaseAnonKey        string
	SupabaseServiceRoleKey string
	SupabaseJWTAudience    string
	SupabaseAuthHookSecret string
	SMSProvider            string
	MobizonAPIBaseURL      string
	MobizonAPIKey          string
	MobizonSender          string
	CookieDomain           string
	ReadTimeout            time.Duration
	WriteTimeout           time.Duration
	IdleTimeout            time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		Environment:            valueOrDefault("APP_ENV", "development"),
		Port:                   valueOrDefault("PORT", "8080"),
		WebOrigin:              strings.TrimRight(os.Getenv("WEB_ORIGIN"), "/"),
		SupabaseURL:            strings.TrimRight(os.Getenv("SUPABASE_URL"), "/"),
		SupabaseAnonKey:        os.Getenv("SUPABASE_ANON_KEY"),
		SupabaseServiceRoleKey: os.Getenv("SUPABASE_SERVICE_ROLE_KEY"),
		SupabaseJWTAudience:    valueOrDefault("SUPABASE_JWT_AUDIENCE", "authenticated"),
		SupabaseAuthHookSecret: os.Getenv("SUPABASE_AUTH_HOOK_SECRET"),
		SMSProvider:            strings.ToLower(valueOrDefault("SMS_PROVIDER", "mobizon")),
		MobizonAPIBaseURL:      strings.TrimRight(valueOrDefault("MOBIZON_API_BASE_URL", "https://api.mobizon.kz"), "/"),
		MobizonAPIKey:          os.Getenv("MOBIZON_API_KEY"),
		MobizonSender:          os.Getenv("MOBIZON_SENDER"),
		CookieDomain:           os.Getenv("COOKIE_DOMAIN"),
		ReadTimeout:            10 * time.Second,
		WriteTimeout:           15 * time.Second,
		IdleTimeout:            60 * time.Second,
	}

	var missing []string
	for name, value := range map[string]string{
		"WEB_ORIGIN":        cfg.WebOrigin,
		"SUPABASE_URL":      cfg.SupabaseURL,
		"SUPABASE_ANON_KEY": cfg.SupabaseAnonKey,
	} {
		if value == "" {
			missing = append(missing, name)
		}
	}
	if cfg.Environment == "production" && cfg.SupabaseServiceRoleKey == "" {
		missing = append(missing, "SUPABASE_SERVICE_ROLE_KEY")
	}
	if cfg.Environment == "production" {
		for name, value := range map[string]string{
			"SUPABASE_AUTH_HOOK_SECRET": cfg.SupabaseAuthHookSecret,
			"MOBIZON_API_KEY":           cfg.MobizonAPIKey,
		} {
			if value == "" {
				missing = append(missing, name)
			}
		}
	}

	if len(missing) > 0 {
		return Config{}, fmt.Errorf("missing required environment variables: %s", strings.Join(missing, ", "))
	}

	if !strings.HasPrefix(cfg.WebOrigin, "http://") && !strings.HasPrefix(cfg.WebOrigin, "https://") {
		return Config{}, errors.New("WEB_ORIGIN must be an absolute HTTP or HTTPS origin")
	}

	if !strings.HasPrefix(cfg.SupabaseURL, "https://") {
		return Config{}, errors.New("SUPABASE_URL must use HTTPS")
	}

	if cfg.SMSProvider != "mobizon" {
		return Config{}, fmt.Errorf("unsupported SMS_PROVIDER %q", cfg.SMSProvider)
	}

	if cfg.Environment == "production" && !strings.HasPrefix(cfg.MobizonAPIBaseURL, "https://") {
		return Config{}, errors.New("MOBIZON_API_BASE_URL must use HTTPS in production")
	}

	return cfg, nil
}

func valueOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
