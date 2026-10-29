package config

import (
	"log"
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
	AIDailyTokenBudget  int
	AppName             string
	AllowSignup         bool
	MCPEnabled          bool
	MapboxToken         string
	GoogleMapsKey       string
	AmapKey             string
	BaiduMapAK          string
	AdminEmails         []string
	OpsToken            string
	UpdateRepo          string
	AutoUpdate          string
	UpdateIntervalHours int
	TrashRetentionDays  int
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
	cfg := Config{
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
		AIDailyTokenBudget:  atoi(env("AI_DAILY_TOKEN_BUDGET", "0"), 0),
		AppName:             env("APP_NAME", "Motion"),
		AllowSignup:         env("ALLOW_SIGNUP", "true") == "true",
		MCPEnabled:          env("MCP_ENABLED", "true") == "true",
		MapboxToken:         env("MAPBOX_TOKEN", ""),
		GoogleMapsKey:       env("GOOGLE_MAPS_KEY", ""),
		AmapKey:             env("AMAP_KEY", ""),
		BaiduMapAK:          env("BAIDU_MAP_AK", ""),
		AdminEmails:         split(strings.ToLower(env("ADMIN_EMAILS", ""))),
		OpsToken:            env("OPS_TOKEN", ""),
		UpdateRepo:          env("UPDATE_REPO", "holihur/motion"),
		AutoUpdate:          env("AUTO_UPDATE", "off"),
		UpdateIntervalHours: atoi(env("UPDATE_INTERVAL_HOURS", "24"), 24),
		TrashRetentionDays:  atoi(env("TRASH_RETENTION_DAYS", "0"), 0),
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
	return cfg
}

func (c Config) OIDCEnabled() bool {
	return c.OIDCIssuer != "" && c.OIDCClientID != "" && c.OIDCClientSecret != ""
}

func (c Config) Validate() {
	isProd := strings.ToLower(strings.TrimSpace(os.Getenv("GO_ENV"))) == "production"
	if isProd && c.JWTSecret == "motion-dev-secret-change-me" {
		log.Fatal("JWT_SECRET must be set to a strong random value in production (GO_ENV=production)")
	}
	if c.EncryptionKey == "motion-dev-secret-change-me" && isProd {
		log.Fatal("ENCRYPTION_KEY must be set to a strong random value in production")
	}
	if c.JWTSecret == c.EncryptionKey && c.JWTSecret != "motion-dev-secret-change-me" && os.Getenv("ALLOW_KEY_REUSE") != "true" {
		log.Fatal("JWT_SECRET and ENCRYPTION_KEY must be different; set ALLOW_KEY_REUSE=true to override")
	}
	if c.JWTSecret == "motion-dev-secret-change-me" || c.EncryptionKey == "motion-dev-secret-change-me" {
		log.Printf("WARNING: using development secrets; do not expose this instance")
	}
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func atoi(value string, fallback int) int {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
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
	replacer := strings.NewReplacer("，", ",", ";", ",", "\n", ",")
	parts := strings.Split(replacer.Replace(v), ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
