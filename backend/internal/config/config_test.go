package config

import "testing"

func TestLoad(t *testing.T) {
	t.Setenv("APP_ENV", "test")
	t.Setenv("PORT", "9090")
	t.Setenv("WEB_ORIGIN", "https://qazauto.example")
	t.Setenv("SUPABASE_URL", "https://project.supabase.co")
	t.Setenv("SUPABASE_ANON_KEY", "test-anon-key")
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "test-secret")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned an error: %v", err)
	}

	if cfg.Port != "9090" {
		t.Fatalf("expected port 9090, got %q", cfg.Port)
	}

	if cfg.SupabaseJWTAudience != "authenticated" {
		t.Fatalf("unexpected JWT audience: %q", cfg.SupabaseJWTAudience)
	}
}

func TestLoadRejectsMissingSecrets(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("WEB_ORIGIN", "https://qazauto.example")
	t.Setenv("SUPABASE_URL", "https://project.supabase.co")
	t.Setenv("SUPABASE_ANON_KEY", "test-anon-key")
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected missing service role key to be rejected")
	}
}

func TestLoadAcceptsAutoCallProvider(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("WEB_ORIGIN", "https://qazauto.example")
	t.Setenv("SUPABASE_URL", "https://project.supabase.co")
	t.Setenv("SUPABASE_ANON_KEY", "test-anon-key")
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
	t.Setenv("SUPABASE_AUTH_HOOK_SECRET", "v1,whsec_test")
	t.Setenv("SMS_PROVIDER", "autocall")
	t.Setenv("AUTOCALL_API_TOKEN", "test-token")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned an error: %v", err)
	}
	if cfg.SMSProvider != "autocall" || cfg.AutoCallAPIToken != "test-token" {
		t.Fatalf("unexpected AutoCall config: %#v", cfg)
	}
}

func TestLoadRejectsMissingAutoCallToken(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("WEB_ORIGIN", "https://qazauto.example")
	t.Setenv("SUPABASE_URL", "https://project.supabase.co")
	t.Setenv("SUPABASE_ANON_KEY", "test-anon-key")
	t.Setenv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key")
	t.Setenv("SUPABASE_AUTH_HOOK_SECRET", "v1,whsec_test")
	t.Setenv("SMS_PROVIDER", "autocall")
	t.Setenv("AUTOCALL_API_TOKEN", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected missing AutoCall token to be rejected")
	}
}
