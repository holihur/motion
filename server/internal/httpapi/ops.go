package httpapi

import (
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"

	"github.com/motion/server/internal/site"
)

type opsOIDCView struct {
	Enabled         bool     `json:"enabled"`
	Issuer          string   `json:"issuer"`
	ClientID        string   `json:"clientId"`
	RedirectURL     string   `json:"redirectUrl"`
	Name            string   `json:"name"`
	Scopes          []string `json:"scopes"`
	AllowedDomains  []string `json:"allowedDomains"`
	AutoCreate      bool     `json:"autoCreate"`
	HasClientSecret bool     `json:"hasClientSecret"`
}

type opsUpdateView struct {
	Repo          string `json:"repo"`
	Mode          string `json:"mode"`
	IntervalHours int    `json:"intervalHours"`
}

type opsSettingsView struct {
	Version            int64         `json:"version"`
	AppName            string        `json:"appName"`
	AllowSignup        bool          `json:"allowSignup"`
	MCPEnabled         bool          `json:"mcpEnabled"`
	AIModel            string        `json:"aiModel"`
	AIDailyTokenBudget int           `json:"aiDailyTokenBudget"`
	AdminEmails        []string      `json:"adminEmails"`
	TrashRetentionDays int           `json:"trashRetentionDays"`
	WatermarkEnabled   bool          `json:"watermarkEnabled"`
	OIDC               opsOIDCView   `json:"oidc"`
	Maps               site.Maps     `json:"maps"`
	Update             opsUpdateView `json:"update"`
}

func opsView(settings site.Settings) opsSettingsView {
	return opsSettingsView{
		Version: settings.UpdatedAt.UnixMilli(),
		AppName: settings.AppName, AllowSignup: settings.AllowSignup,
		MCPEnabled: settings.MCPEnabled, AIModel: settings.AIModel,
		AIDailyTokenBudget: settings.AIDailyTokenBudget,
		AdminEmails:        append([]string{}, settings.AdminEmails...),
		TrashRetentionDays: settings.TrashRetentionDays,
		WatermarkEnabled:   settings.WatermarkEnabled,
		OIDC: opsOIDCView{
			Enabled: settings.OIDC.Enabled, Issuer: settings.OIDC.Issuer,
			ClientID: settings.OIDC.ClientID, RedirectURL: settings.OIDC.RedirectURL,
			Name: settings.OIDC.Name, Scopes: append([]string{}, settings.OIDC.Scopes...),
			AllowedDomains:  append([]string(nil), settings.OIDC.AllowedDomains...),
			AutoCreate:      settings.OIDC.AutoCreate,
			HasClientSecret: settings.OIDC.ClientSecret != "",
		},
		Maps: settings.Maps,
		Update: opsUpdateView{
			Repo: settings.Update.Repo, Mode: settings.Update.Mode, IntervalHours: settings.Update.IntervalHours,
		},
	}
}

func (s *Server) getOpsSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, opsView(s.siteSnapshot()))
}

type opsOIDCRequest struct {
	Enabled        *bool     `json:"enabled"`
	Issuer         *string   `json:"issuer"`
	ClientID       *string   `json:"clientId"`
	ClientSecret   *string   `json:"clientSecret"`
	ClearSecret    bool      `json:"clearClientSecret"`
	RedirectURL    *string   `json:"redirectUrl"`
	Name           *string   `json:"name"`
	Scopes         *[]string `json:"scopes"`
	AllowedDomains *[]string `json:"allowedDomains"`
	AutoCreate     *bool     `json:"autoCreate"`
}

type opsUpdateRequest struct {
	Repo          *string `json:"repo"`
	Mode          *string `json:"mode"`
	IntervalHours *int    `json:"intervalHours"`
}

type opsSettingsRequest struct {
	Version            *int64            `json:"version"`
	AppName            *string           `json:"appName"`
	AllowSignup        *bool             `json:"allowSignup"`
	MCPEnabled         *bool             `json:"mcpEnabled"`
	AIModel            *string           `json:"aiModel"`
	AIDailyTokenBudget *int              `json:"aiDailyTokenBudget"`
	AdminEmails        *[]string         `json:"adminEmails"`
	TrashRetentionDays *int              `json:"trashRetentionDays"`
	WatermarkEnabled   *bool             `json:"watermarkEnabled"`
	OIDC               *opsOIDCRequest   `json:"oidc"`
	Maps               *site.Maps        `json:"maps"`
	Update             *opsUpdateRequest `json:"update"`
}

func (s *Server) saveOpsSettings(w http.ResponseWriter, r *http.Request) {
	var req opsSettingsRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	settings := s.siteSnapshot()
	if req.Version != nil && *req.Version != settings.UpdatedAt.UnixMilli() {
		writeErr(w, http.StatusConflict, "these settings were changed elsewhere; reload before saving")
		return
	}

	if req.AppName != nil {
		name := strings.TrimSpace(*req.AppName)
		if name == "" || len([]rune(name)) > 80 {
			writeErr(w, http.StatusBadRequest, "app name must be between 1 and 80 characters")
			return
		}
		settings.AppName = name
	}
	if req.AllowSignup != nil {
		settings.AllowSignup = *req.AllowSignup
	}
	if req.MCPEnabled != nil {
		settings.MCPEnabled = *req.MCPEnabled
	}
	if req.AIModel != nil {
		model := strings.TrimSpace(*req.AIModel)
		if model == "" || len(model) > 80 {
			writeErr(w, http.StatusBadRequest, "AI model must be between 1 and 80 characters")
			return
		}
		settings.AIModel = model
	}
	if req.AIDailyTokenBudget != nil {
		budget := *req.AIDailyTokenBudget
		if budget < 0 || budget > 100_000_000 {
			writeErr(w, http.StatusBadRequest, "AI daily token budget must be between 0 and 100000000")
			return
		}
		settings.AIDailyTokenBudget = budget
	}
	if req.AdminEmails != nil {
		emails := site.NormalizeEmails(*req.AdminEmails)
		for _, email := range emails {
			if !emailPattern.MatchString(email) || len(email) > 160 {
				writeErr(w, http.StatusBadRequest, "invalid administrator email: "+email)
				return
			}
		}
		settings.AdminEmails = emails
	}

	if req.TrashRetentionDays != nil {
		days := *req.TrashRetentionDays
		if days < 0 || days > 3650 {
			writeErr(w, http.StatusBadRequest, "trash retention must be between 0 and 3650 days")
			return
		}
		settings.TrashRetentionDays = days
	}
	if req.WatermarkEnabled != nil {
		settings.WatermarkEnabled = *req.WatermarkEnabled
	}

	if req.Maps != nil {
		settings.Maps = site.Maps{
			MapboxToken:   strings.TrimSpace(req.Maps.MapboxToken),
			GoogleMapsKey: strings.TrimSpace(req.Maps.GoogleMapsKey),
			AmapKey:       strings.TrimSpace(req.Maps.AmapKey),
			BaiduMapAK:    strings.TrimSpace(req.Maps.BaiduMapAK),
		}
	}
	if req.OIDC != nil {
		in := req.OIDC
		if in.Enabled != nil {
			settings.OIDC.Enabled = *in.Enabled
		}
		if in.Issuer != nil {
			settings.OIDC.Issuer = strings.TrimSpace(*in.Issuer)
		}
		if in.ClientID != nil {
			settings.OIDC.ClientID = strings.TrimSpace(*in.ClientID)
		}
		if in.RedirectURL != nil {
			settings.OIDC.RedirectURL = strings.TrimSpace(*in.RedirectURL)
		}
		if in.Name != nil {
			settings.OIDC.Name = strings.TrimSpace(*in.Name)
		}
		if in.Scopes != nil {
			settings.OIDC.Scopes = splitList(*in.Scopes)
		}
		if in.AllowedDomains != nil {
			settings.OIDC.AllowedDomains = splitList(*in.AllowedDomains)
		}
		if in.AutoCreate != nil {
			settings.OIDC.AutoCreate = *in.AutoCreate
		}
		if in.ClearSecret {
			settings.OIDC.ClientSecret = ""
		}
		if in.ClientSecret != nil && strings.TrimSpace(*in.ClientSecret) != "" {
			settings.OIDC.ClientSecret = strings.TrimSpace(*in.ClientSecret)
		}
		if settings.OIDC.Enabled {
			if settings.OIDC.Issuer == "" || !strings.HasPrefix(settings.OIDC.Issuer, "http") {
				writeErr(w, http.StatusBadRequest, "OIDC issuer must be an https URL")
				return
			}
			if settings.OIDC.ClientID == "" {
				writeErr(w, http.StatusBadRequest, "OIDC client id is required")
				return
			}
			if settings.OIDC.ClientSecret == "" {
				writeErr(w, http.StatusBadRequest, "OIDC client secret is required")
				return
			}
			if len(settings.OIDC.Scopes) == 0 {
				settings.OIDC.Scopes = []string{"openid", "email", "profile"}
			}
		}
	}

	if req.Update != nil {
		in := req.Update
		if in.Repo != nil {
			repo := strings.TrimSpace(*in.Repo)
			if !strings.Contains(repo, "/") || strings.ContainsAny(repo, " \t") {
				writeErr(w, http.StatusBadRequest, "update repo must look like owner/repository")
				return
			}
			settings.Update.Repo = repo
		}
		if in.Mode != nil {
			mode := strings.ToLower(strings.TrimSpace(*in.Mode))
			if mode != "off" && mode != "check" && mode != "apply" {
				writeErr(w, http.StatusBadRequest, "update mode must be off, check or apply")
				return
			}
			settings.Update.Mode = mode
		}
		if in.IntervalHours != nil {
			if *in.IntervalHours < 1 || *in.IntervalHours > 168 {
				writeErr(w, http.StatusBadRequest, "update interval must be between 1 and 168 hours")
				return
			}
			settings.Update.IntervalHours = *in.IntervalHours
		}
	}

	if err := site.Save(r.Context(), s.store.Settings, settings, s.cfg.EncryptionKey, "ops-access-token"); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save settings")
		return
	}
	s.setSite(settings)
	s.invalidateOIDC()
	writeJSON(w, http.StatusOK, opsView(settings))
}

func splitList(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			part = strings.TrimSpace(part)
			if part != "" {
				out = append(out, part)
			}
		}
	}
	return out
}

type opsStats struct {
	Users           int64 `json:"users"`
	Workspaces      int64 `json:"workspaces"`
	Pages           int64 `json:"pages"`
	Archived        int64 `json:"archived"`
	Comments        int64 `json:"comments"`
	Revisions       int64 `json:"revisions"`
	Tokens          int64 `json:"tokens"`
	AIConfigured    int64 `json:"aiConfigured"`
	DataSize        int64 `json:"dataSize"`
	StorageSize     int64 `json:"storageSize"`
	RealtimeClients int   `json:"realtimeClients"`
	RealtimePages   int   `json:"realtimePages"`
	WebhookFailed   int64 `json:"webhookFailed"`
	AgentRunsToday  int64 `json:"agentRunsToday"`
	ExportsToday    int64 `json:"exportsToday"`
	CommentsToday   int64 `json:"commentsToday"`
}

func (s *Server) getOpsStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	stats := opsStats{}
	stats.Users, _ = s.store.Users.CountDocuments(ctx, bson.M{})
	stats.Workspaces, _ = s.store.Workspaces.CountDocuments(ctx, bson.M{})
	stats.Pages, _ = s.store.Pages.CountDocuments(ctx, bson.M{})
	stats.Archived, _ = s.store.Pages.CountDocuments(ctx, bson.M{"archived": true})
	stats.Comments, _ = s.store.Comments.CountDocuments(ctx, bson.M{})
	stats.Revisions, _ = s.store.Revisions.CountDocuments(ctx, bson.M{})
	stats.Tokens, _ = s.store.Tokens.CountDocuments(ctx, bson.M{})
	stats.AIConfigured, _ = s.store.AISettings.CountDocuments(ctx, bson.M{})
	var dbStats struct {
		DataSize    int64 `bson:"dataSize"`
		StorageSize int64 `bson:"storageSize"`
	}
	_ = s.store.DB.RunCommand(ctx, bson.D{{Key: "dbStats", Value: 1}}).Decode(&dbStats)
	stats.DataSize = dbStats.DataSize
	stats.StorageSize = dbStats.StorageSize
	stats.RealtimeClients, stats.RealtimePages, _ = s.hub.Stats()
	stats.WebhookFailed, _ = s.store.Deliveries.CountDocuments(ctx, bson.M{"status": "failed"})
	now := time.Now().UTC()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	stats.AgentRunsToday, _ = s.store.Audit.CountDocuments(ctx, bson.M{"action": "agent.run", "createdAt": bson.M{"$gte": startOfDay}})
	stats.ExportsToday, _ = s.store.Audit.CountDocuments(ctx, bson.M{"action": "page.export", "createdAt": bson.M{"$gte": startOfDay}})
	stats.CommentsToday, _ = s.store.Comments.CountDocuments(ctx, bson.M{"createdAt": bson.M{"$gte": startOfDay}})
	writeJSON(w, http.StatusOK, stats)
}
