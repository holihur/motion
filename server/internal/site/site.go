package site

import (
	"context"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/config"
	"github.com/motion/server/internal/secret"
)

const globalID = "global"

type OIDC struct {
	Enabled            bool     `bson:"enabled" json:"enabled"`
	Issuer             string   `bson:"issuer" json:"issuer"`
	ClientID           string   `bson:"clientId" json:"clientId"`
	ClientSecret       string   `bson:"-" json:"-"`
	ClientSecretCipher string   `bson:"clientSecretCipher,omitempty" json:"-"`
	RedirectURL        string   `bson:"redirectUrl" json:"redirectUrl"`
	Name               string   `bson:"name" json:"name"`
	Scopes             []string `bson:"scopes" json:"scopes"`
	AllowedDomains     []string `bson:"allowedDomains" json:"allowedDomains"`
	AutoCreate         bool     `bson:"autoCreate" json:"autoCreate"`
}

func (o OIDC) Ready() bool {
	return o.Enabled && o.Issuer != "" && o.ClientID != "" && o.ClientSecret != ""
}

type Update struct {
	Repo          string `bson:"repo" json:"repo"`
	Mode          string `bson:"mode" json:"mode"` // off, check, apply
	IntervalHours int    `bson:"intervalHours" json:"intervalHours"`
}

type Maps struct {
	MapboxToken   string `bson:"mapboxToken,omitempty" json:"mapboxToken"`
	GoogleMapsKey string `bson:"googleMapsKey,omitempty" json:"googleMapsKey"`
	AmapKey       string `bson:"amapKey,omitempty" json:"amapKey"`
	BaiduMapAK    string `bson:"baiduMapAK,omitempty" json:"baiduMapAK"`
}

type Settings struct {
	ID                 string    `bson:"_id" json:"-"`
	AppName            string    `bson:"appName" json:"appName"`
	AllowSignup        bool      `bson:"allowSignup" json:"allowSignup"`
	MCPEnabled         bool      `bson:"mcpEnabled" json:"mcpEnabled"`
	AIModel            string    `bson:"aiModel" json:"aiModel"`
	AIDailyTokenBudget int       `bson:"aiDailyTokenBudget" json:"aiDailyTokenBudget"`
	AdminEmails        []string  `bson:"adminEmails" json:"adminEmails"`
	TrashRetentionDays int       `bson:"trashRetentionDays" json:"trashRetentionDays"`
	WatermarkEnabled   bool      `bson:"watermarkEnabled,omitempty" json:"watermarkEnabled,omitempty"`
	OIDC               OIDC      `bson:"oidc" json:"oidc"`
	Maps               Maps      `bson:"maps,omitempty" json:"maps"`
	Update             Update    `bson:"update" json:"update"`
	UpdatedAt          time.Time `bson:"updatedAt" json:"updatedAt"`
	UpdatedBy          string    `bson:"updatedBy" json:"updatedBy"`
}

func Defaults(cfg config.Config) Settings {
	scopes := cfg.OIDCScopes
	if len(scopes) == 0 {
		scopes = []string{"openid", "email", "profile"}
	}
	return Settings{
		ID:                 globalID,
		AppName:            cfg.AppName,
		AllowSignup:        cfg.AllowSignup,
		MCPEnabled:         cfg.MCPEnabled,
		AIModel:            cfg.AIModel,
		AIDailyTokenBudget: cfg.AIDailyTokenBudget,
		AdminEmails:        normalizeEmails(cfg.AdminEmails),
		TrashRetentionDays: cfg.TrashRetentionDays,
		OIDC: OIDC{
			Enabled:        cfg.OIDCEnabled(),
			Issuer:         cfg.OIDCIssuer,
			ClientID:       cfg.OIDCClientID,
			ClientSecret:   cfg.OIDCClientSecret,
			RedirectURL:    cfg.OIDCRedirectURL,
			Name:           cfg.OIDCName,
			Scopes:         scopes,
			AllowedDomains: append([]string(nil), cfg.OIDCAllowedDomains...),
			AutoCreate:     cfg.OIDCAutoCreate,
		},
		Maps: Maps{
			MapboxToken: cfg.MapboxToken, GoogleMapsKey: cfg.GoogleMapsKey,
			AmapKey: cfg.AmapKey, BaiduMapAK: cfg.BaiduMapAK,
		},
		Update: Update{
			Repo:          cfg.UpdateRepo,
			Mode:          cfg.AutoUpdate,
			IntervalHours: cfg.UpdateIntervalHours,
		},
		UpdatedAt: time.Now().UTC(),
	}
}

func Load(ctx context.Context, collection *mongo.Collection, cfg config.Config, encryptionKey string) (Settings, error) {
	settings := Defaults(cfg)
	settings.ID = globalID
	err := collection.FindOne(ctx, bson.M{"_id": globalID}).Decode(&settings)
	if err == mongo.ErrNoDocuments {
		return settings, nil
	}
	if err != nil {
		return settings, err
	}
	if settings.OIDC.ClientSecretCipher != "" {
		plain, err := secret.Decrypt(encryptionKey, settings.OIDC.ClientSecretCipher)
		if err != nil {
			return settings, err
		}
		settings.OIDC.ClientSecret = plain
	}
	return settings, nil
}

func Save(ctx context.Context, collection *mongo.Collection, settings Settings, encryptionKey, updatedBy string) error {
	settings.ID = globalID
	settings.AdminEmails = normalizeEmails(settings.AdminEmails)
	if settings.OIDC.ClientSecret == "" {
		settings.OIDC.ClientSecretCipher = ""
	} else {
		cipherText, err := secret.Encrypt(encryptionKey, settings.OIDC.ClientSecret)
		if err != nil {
			return err
		}
		settings.OIDC.ClientSecretCipher = cipherText
	}
	settings.UpdatedAt = time.Now().UTC()
	settings.UpdatedBy = updatedBy
	_, err := collection.UpdateOne(ctx,
		bson.M{"_id": globalID},
		bson.M{"$set": settings},
		options.Update().SetUpsert(true),
	)
	return err
}

func normalizeEmails(emails []string) []string {
	out := make([]string, 0, len(emails))
	seen := map[string]bool{}
	for _, email := range emails {
		email = strings.ToLower(strings.TrimSpace(email))
		if email == "" || seen[email] {
			continue
		}
		seen[email] = true
		out = append(out, email)
	}
	return out
}

func NormalizeEmails(emails []string) []string {
	return normalizeEmails(emails)
}
