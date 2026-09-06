package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

type Config struct {
	Environment                   string
	Port                          string
	WebOrigin                     string
	SupabaseURL                   string
	SupabaseAnonKey               string
	SupabaseServiceRoleKey        string
	SupabaseJWTAudience           string
	SupabaseAuthHookSecret        string
	SMSProvider                   string
	MobizonAPIBaseURL             string
	MobizonAPIKey                 string
	MobizonSender                 string
	AutoCallAPIBaseURL            string
	AutoCallAPIToken              string
	CookieDomain                  string
	R2AccountID                   string
	R2AccessKeyID                 string
	R2SecretAccessKey             string
	R2PublicBucket                string
	R2PublicBaseURL               string
	CloudflareStreamAccountID     string
	CloudflareStreamAPIToken      string
	CloudflareStreamWebhookSecret string
	ReadTimeout                   time.Duration
	WriteTimeout                  time.Duration
	IdleTimeout                   time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		Environment:                   valueOrDefault("APP_ENV", "development"),
		Port:                          valueOrDefault("PORT", "8080"),
		WebOrigin:                     strings.TrimRight(os.Getenv("WEB_ORIGIN"), "/"),
		SupabaseURL:                   strings.TrimRight(os.Getenv("SUPABASE_URL"), "/"),
		SupabaseAnonKey:               os.Getenv("SUPABASE_ANON_KEY"),
		SupabaseServiceRoleKey:        os.Getenv("SUPABASE_SERVICE_ROLE_KEY"),
		SupabaseJWTAudience:           valueOrDefault("SUPABASE_JWT_AUDIENCE", "authenticated"),
		SupabaseAuthHookSecret:        os.Getenv("SUPABASE_AUTH_HOOK_SECRET"),
		SMSProvider:                   strings.ToLower(valueOrDefault("SMS_PROVIDER", "mobizon")),
		MobizonAPIBaseURL:             strings.TrimRight(valueOrDefault("MOBIZON_API_BASE_URL", "https://api.mobizon.kz"), "/"),
		MobizonAPIKey:                 os.Getenv("MOBIZON_API_KEY"),
		MobizonSender:                 os.Getenv("MOBIZON_SENDER"),
		AutoCallAPIBaseURL:            strings.TrimRight(valueOrDefault("AUTOCALL_API_BASE_URL", "https://autocall.kz/api/v1"), "/"),
		AutoCallAPIToken:              os.Getenv("AUTOCALL_API_TOKEN"),
		CookieDomain:                  os.Getenv("COOKIE_DOMAIN"),
		R2AccountID:                   os.Getenv("R2_ACCOUNT_ID"),
		R2AccessKeyID:                 os.Getenv("R2_ACCESS_KEY_ID"),
		R2SecretAccessKey:             os.Getenv("R2_SECRET_ACCESS_KEY"),
		R2PublicBucket:                os.Getenv("R2_PUBLIC_BUCKET"),
		R2PublicBaseURL:               strings.TrimRight(os.Getenv("R2_PUBLIC_BASE_URL"), "/"),
		CloudflareStreamAccountID:     os.Getenv("CLOUDFLARE_STREAM_ACCOUNT_ID"),
		CloudflareStreamAPIToken:      os.Getenv("CLOUDFLARE_STREAM_API_TOKEN"),
		CloudflareStreamWebhookSecret: os.Getenv("CLOUDFLARE_STREAM_WEBHOOK_SECRET"),
		ReadTimeout:                   10 * time.Second,
		WriteTimeout:                  15 * time.Second,
		IdleTimeout:                   60 * time.Second,
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
	if cfg.Environment == "production" && cfg.SupabaseAuthHookSecret == "" {
		missing = append(missing, "SUPABASE_AUTH_HOOK_SECRET")
	}
	if cfg.Environment == "production" {
		switch cfg.SMSProvider {
		case "mobizon":
			if cfg.MobizonAPIKey == "" {
				missing = append(missing, "MOBIZON_API_KEY")
			}
		case "autocall":
			if cfg.AutoCallAPIToken == "" {
				missing = append(missing, "AUTOCALL_API_TOKEN")
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

	if cfg.SMSProvider != "mobizon" && cfg.SMSProvider != "autocall" {
		return Config{}, fmt.Errorf("unsupported SMS_PROVIDER %q", cfg.SMSProvider)
	}

	if cfg.Environment == "production" {
		if cfg.SMSProvider == "mobizon" && !strings.HasPrefix(cfg.MobizonAPIBaseURL, "https://") {
			return Config{}, errors.New("MOBIZON_API_BASE_URL must use HTTPS in production")
		}
		if cfg.SMSProvider == "autocall" && !strings.HasPrefix(cfg.AutoCallAPIBaseURL, "https://") {
			return Config{}, errors.New("AUTOCALL_API_BASE_URL must use HTTPS in production")
		}
	}

	return cfg, nil
}

func valueOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
