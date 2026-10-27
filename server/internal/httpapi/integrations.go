package httpapi

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/secret"
	"github.com/motion/server/internal/sshpub"
	"github.com/motion/server/internal/staticpublish"
)

type integrationView struct {
	Provider   string            `json:"provider"`
	Config     map[string]string `json:"config"`
	Events     []string          `json:"events,omitempty"`
	SecretHint string            `json:"secretHint,omitempty"`
	HasSecret  bool              `json:"hasSecret"`
	UpdatedAt  time.Time         `json:"updatedAt"`
}

type saveIntegrationRequest struct {
	Config map[string]string `json:"config"`
	Events []string          `json:"events"`
	Secret string            `json:"secret"`
}

func integrationViewOf(item model.Integration) integrationView {
	config := item.Config
	if config == nil {
		config = map[string]string{}
	}
	// Never return a webhook URL's embedded credentials to the browser.
	if parsed, err := url.Parse(config["url"]); err == nil && parsed.User != nil {
		parsed.User = nil
		config["url"] = parsed.String()
	}
	return integrationView{
		Provider: item.Provider, Config: config, Events: item.Events,
		SecretHint: item.SecretHint, HasSecret: item.SecretCipher != "", UpdatedAt: item.UpdatedAt,
	}
}

func (s *Server) listIntegrations(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	cur, err := s.store.Integrations.Find(r.Context(), bson.M{"workspaceId": wsID})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load integrations")
		return
	}
	defer cur.Close(r.Context())
	var items []model.Integration
	if err := cur.All(r.Context(), &items); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load integrations")
		return
	}
	out := make([]integrationView, 0, len(items))
	for _, item := range items {
		out = append(out, integrationViewOf(item))
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) saveIntegration(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	provider := strings.ToLower(strings.TrimSpace(chiURLParam(r, "provider")))
	if provider != "webhook" && provider != "ssh" {
		writeErr(w, http.StatusBadRequest, "unsupported integration provider")
		return
	}
	var req saveIntegrationRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Config == nil {
		req.Config = map[string]string{}
	}
	if provider == "webhook" {
		raw := strings.TrimSpace(req.Config["url"])
		parsed, err := url.Parse(raw)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			writeErr(w, http.StatusBadRequest, "webhook URL must be an http(s) URL")
			return
		}
		if len(req.Events) == 0 {
			req.Events = []string{"*"}
		}
	} else {
		for _, key := range []string{"host", "username", "remotePath"} {
			if strings.TrimSpace(req.Config[key]) == "" {
				writeErr(w, http.StatusBadRequest, key+" is required")
				return
			}
		}
		if strings.TrimSpace(req.Config["port"]) == "" {
			req.Config["port"] = "22"
		}
		if strings.Contains(req.Config["remotePath"], "..") {
			writeErr(w, http.StatusBadRequest, "remote path cannot contain ..")
			return
		}
	}
	now := time.Now().UTC()
	var existing model.Integration
	err = s.store.Integrations.FindOne(r.Context(), bson.M{"workspaceId": wsID, "provider": provider}).Decode(&existing)
	set := bson.M{
		"workspaceId": wsID, "provider": provider, "config": req.Config,
		"events": req.Events, "updatedAt": now,
	}
	if strings.TrimSpace(req.Secret) != "" {
		encrypted, err := secret.Encrypt(s.cfg.EncryptionKey, req.Secret)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not secure integration secret")
			return
		}
		set["secretCipher"] = encrypted
		hint := req.Secret
		if len(hint) > 4 {
			hint = "••••" + hint[len(hint)-4:]
		} else {
			hint = "••••"
		}
		set["secretHint"] = hint
	}
	if err == mongo.ErrNoDocuments {
		if provider == "ssh" && strings.TrimSpace(req.Secret) == "" {
			writeErr(w, http.StatusBadRequest, "an SSH private key is required")
			return
		}
		set["createdBy"] = currentUserID(r)
		set["createdAt"] = now
	}
	if _, err := s.store.Integrations.UpdateOne(r.Context(),
		bson.M{"workspaceId": wsID, "provider": provider},
		bson.M{"$set": set}, options.Update().SetUpsert(true)); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save integration")
		return
	}
	var saved model.Integration
	if err := s.store.Integrations.FindOne(r.Context(), bson.M{"workspaceId": wsID, "provider": provider}).Decode(&saved); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load integration")
		return
	}
	writeJSON(w, http.StatusOK, integrationViewOf(saved))
}

func (s *Server) deleteIntegration(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	provider := strings.ToLower(strings.TrimSpace(chiURLParam(r, "provider")))
	if _, err := s.store.Integrations.DeleteOne(r.Context(), bson.M{"workspaceId": wsID, "provider": provider}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not remove integration")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listDeliveries(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	cur, err := s.store.Deliveries.Find(r.Context(), bson.M{"workspaceId": wsID}, options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(50))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load deliveries")
		return
	}
	defer cur.Close(r.Context())
	deliveries := make([]model.WebhookDelivery, 0)
	if err := cur.All(r.Context(), &deliveries); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load deliveries")
		return
	}
	writeJSON(w, http.StatusOK, deliveries)
}

type sshPublishRequest struct {
	PageID          string `json:"pageId"`
	IncludeChildren bool   `json:"includeChildren"`
}

func (s *Server) publishSSH(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	var req sshPublishRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	pageID, err := primitive.ObjectIDFromHex(strings.TrimSpace(req.PageID))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, role, err := s.accessiblePage(r, pageID)
	if err != nil || page.WorkspaceID != wsID {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	if !canEdit(role) {
		writeErr(w, http.StatusForbidden, "you do not have permission to publish this page")
		return
	}
	var integration model.Integration
	if err := s.store.Integrations.FindOne(r.Context(), bson.M{"workspaceId": wsID, "provider": "ssh"}).Decode(&integration); err != nil {
		writeErr(w, http.StatusBadRequest, "configure SSH publishing in Settings → Integrations first")
		return
	}
	key, err := secret.Decrypt(s.cfg.EncryptionKey, integration.SecretCipher)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "the SSH private key could not be decrypted; save it again")
		return
	}
	pages := []model.Page{page}
	if req.IncludeChildren {
		cur, err := s.store.Pages.Find(r.Context(), bson.M{"workspaceId": wsID, "archived": false})
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not load child pages")
			return
		}
		defer cur.Close(r.Context())
		var all []model.Page
		if err := cur.All(r.Context(), &all); err != nil {
			writeErr(w, http.StatusInternalServerError, "could not load child pages")
			return
		}
		children := map[primitive.ObjectID][]model.Page{}
		for _, item := range all {
			if item.ParentID != nil {
				children[*item.ParentID] = append(children[*item.ParentID], item)
			}
		}
		pages = pages[:0]
		var walk func(item model.Page)
		seen := map[primitive.ObjectID]bool{}
		walk = func(item model.Page) {
			if seen[item.ID] {
				return
			}
			seen[item.ID] = true
			pages = append(pages, item)
			for _, child := range children[item.ID] {
				walk(child)
			}
		}
		walk(page)
	}
	files, err := staticpublish.Render(page.ID, pages, integration.Config["publicBaseUrl"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not render page")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	if err := sshpub.Publish(ctx, sshpub.Config{
		Host: integration.Config["host"], Port: integration.Config["port"],
		Username: integration.Config["username"], PrivateKey: key,
		RemotePath: integration.Config["remotePath"], HostFingerprint: integration.Config["hostFingerprint"],
	}, files); err != nil {
		writeErr(w, http.StatusBadGateway, "SSH publish failed: "+err.Error())
		return
	}
	base := strings.TrimRight(strings.TrimSpace(integration.Config["publicBaseUrl"]), "/")
	publicURL := base + "/"
	if base == "" {
		publicURL = ""
	}
	s.webhooks.Emit(r.Context(), wsID, "page.published", map[string]any{
		"pageId": page.ID.Hex(), "pageTitle": page.Title, "provider": "ssh",
		"url": publicURL, "fileCount": len(files),
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"provider": "ssh", "pageId": page.ID.Hex(), "url": publicURL,
		"fileCount": len(files), "files": len(files),
	})
}
