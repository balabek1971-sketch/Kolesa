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
