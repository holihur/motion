package config

import (
	"os"
	"strings"
	"time"
)

type Config struct {
	Port                string
	MongoURI            string
	MongoDB             string
	JWTSecret           string
	EncryptionKey       string
	TokenTTL            time.Duration
	CORSOrigins         []string
	SeedDemo            bool
	WebDir              string
	AIModel             string
	AppName             string
	AllowSignup         bool
	MCPEnabled          bool
	AdminEmails         []string
	OpsToken            string
	UpdateRepo          string
	AutoUpdate          string
	UpdateIntervalHours int
	GitHubToken         string
	OIDCIssuer          string
	OIDCClientID        string
	OIDCClientSecret    string
	OIDCRedirectURL     string
	OIDCName            string
	OIDCScopes          []string
	OIDCAllowedDomains  []string
	OIDCAutoCreate      bool
}

func Load() Config {
	return Config{
		Port:                env("PORT", "8787"),
		MongoURI:            env("MONGODB_URI", "mongodb://127.0.0.1:27017"),
		MongoDB:             env("MONGODB_DB", "motion"),
		JWTSecret:           env("JWT_SECRET", "motion-dev-secret-change-me"),
		EncryptionKey:       env("ENCRYPTION_KEY", env("JWT_SECRET", "motion-dev-secret-change-me")),
		TokenTTL:            7 * 24 * time.Hour,
		CORSOrigins:         split(env("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")),
		SeedDemo:            env("SEED_DEMO", "true") == "true",
		WebDir:              env("WEB_DIR", ""),
		AIModel:             env("AI_MODEL", "gemini-flash-lite-latest"),
		AppName:             env("APP_NAME", "Motion"),
		AllowSignup:         env("ALLOW_SIGNUP", "true") == "true",
		MCPEnabled:          env("MCP_ENABLED", "true") == "true",
		AdminEmails:         split(strings.ToLower(env("ADMIN_EMAILS", ""))),
		OpsToken:            env("OPS_TOKEN", ""),
		UpdateRepo:          env("UPDATE_REPO", "holihur/motion"),
		AutoUpdate:          env("AUTO_UPDATE", "off"),
		UpdateIntervalHours: atoi(env("UPDATE_INTERVAL_HOURS", "24"), 24),
		GitHubToken:         env("GITHUB_TOKEN", ""),
		OIDCIssuer:          env("OIDC_ISSUER", ""),
		OIDCClientID:        env("OIDC_CLIENT_ID", ""),
		OIDCClientSecret:    env("OIDC_CLIENT_SECRET", ""),
		OIDCRedirectURL:     env("OIDC_REDIRECT_URL", ""),
		OIDCName:            env("OIDC_NAME", "Single sign-on"),
		OIDCScopes:          split(env("OIDC_SCOPES", "openid,email,profile")),
		OIDCAllowedDomains:  split(env("OIDC_ALLOWED_DOMAINS", "")),
		OIDCAutoCreate:      env("OIDC_AUTO_CREATE", "true") == "true",
	}
}

func (c Config) OIDCEnabled() bool {
	return c.OIDCIssuer != "" && c.OIDCClientID != "" && c.OIDCClientSecret != ""
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func atoi(value string, fallback int) int {
	var out int
	for _, char := range value {
		if char < '0' || char > '9' {
			return fallback
		}
		out = out*10 + int(char-'0')
	}
	if out <= 0 {
		return fallback
	}
	return out
}

func split(v string) []string {
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
