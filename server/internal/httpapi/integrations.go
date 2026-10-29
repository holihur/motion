package httpapi

import (
	"context"
	"errors"
	"mime"
	"net"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/adf"
	"github.com/motion/server/internal/atlassian"
	"github.com/motion/server/internal/gitpublish"
	"github.com/motion/server/internal/importer"
	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/objectstore"
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
	Enabled    bool              `json:"enabled"`
	UpdatedAt  time.Time         `json:"updatedAt"`
}

type saveIntegrationRequest struct {
	Config  map[string]string `json:"config"`
	Events  []string          `json:"events"`
	Secret  string            `json:"secret"`
	Enabled *bool             `json:"enabled,omitempty"`
}

func integrationViewOf(item model.Integration) integrationView {
	config := make(map[string]string, len(item.Config))
	for key, value := range item.Config {
		config[key] = value
	}
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
		SecretHint: item.SecretHint, HasSecret: item.SecretCipher != "", Enabled: !item.Disabled, UpdatedAt: item.UpdatedAt,
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

func validatePublicWebhookURL(raw string) error {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" {
		return errors.New("URL must be an http(s) URL")
	}
	if host := parsed.Hostname(); net.ParseIP(host) == nil {
		ips, err := net.LookupIP(host)
		if err != nil {
			return nil
		}
		for _, ip := range ips {
			if ip.IsLoopback() {
				continue
			}
			if ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
				return errors.New("URL points to a private network")
			}
		}
		return nil
	}
	ip := net.ParseIP(parsed.Hostname())
	if ip != nil && !ip.IsLoopback() && (ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified()) {
		return errors.New("URL points to a private network")
	}
	return nil
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
	if provider != "webhook" && provider != "ssh" && provider != "git" && provider != "jira" && provider != "confluence" && provider != "s3" && provider != "aliyun_oss" && provider != "qiniu" && provider != "tencent_cos" && provider != "notion" && provider != "yuque" && provider != "feishu" {
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
	if publicBase := strings.TrimSpace(req.Config["publicBaseUrl"]); publicBase != "" {
		if err := validatePublicWebhookURL(publicBase); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if provider == "webhook" {
		if err := validatePublicWebhookURL(req.Config["url"]); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		if len(req.Events) == 0 {
			req.Events = []string{"*"}
		}
	} else if provider == "jira" {
		if err := validatePublicWebhookURL(req.Config["siteUrl"]); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		for _, key := range []string{"siteUrl", "email", "projectKey"} {
			if strings.TrimSpace(req.Config[key]) == "" {
				writeErr(w, http.StatusBadRequest, key+" is required")
				return
			}
		}
		if strings.TrimSpace(req.Config["issueType"]) == "" {
			req.Config["issueType"] = "Task"
		}
	} else if provider == "confluence" {
		if err := validatePublicWebhookURL(req.Config["siteUrl"]); err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		for _, key := range []string{"siteUrl", "email", "spaceId"} {
			if strings.TrimSpace(req.Config[key]) == "" {
				writeErr(w, http.StatusBadRequest, key+" is required")
				return
			}
		}
	} else if provider == "aliyun_oss" {
		for _, key := range []string{"endpoint", "bucket"} {
			if strings.TrimSpace(req.Config[key]) == "" {
				writeErr(w, http.StatusBadRequest, key+" is required")
				return
			}
		}
		if endpoint := strings.TrimSpace(req.Config["endpoint"]); endpoint != "" {
			if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
				endpoint = "https://" + endpoint
			}
			if err := validatePublicWebhookURL(endpoint); err != nil {
				writeErr(w, http.StatusBadRequest, "endpoint "+err.Error())
				return
			}
		}
	} else if provider == "tencent_cos" {
		for _, key := range []string{"bucket", "region"} {
			if strings.TrimSpace(req.Config[key]) == "" {
				writeErr(w, http.StatusBadRequest, key+" is required")
				return
			}
		}
		if endpoint := strings.TrimSpace(req.Config["endpoint"]); endpoint != "" {
			if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
				endpoint = "https://" + endpoint
			}
			if err := validatePublicWebhookURL(endpoint); err != nil {
				writeErr(w, http.StatusBadRequest, "endpoint "+err.Error())
				return
			}
		}
	} else if provider == "qiniu" {
		for _, key := range []string{"bucket", "publicBaseUrl"} {
			if strings.TrimSpace(req.Config[key]) == "" {
				writeErr(w, http.StatusBadRequest, key+" is required")
				return
			}
		}
		if endpoint := strings.TrimSpace(req.Config["publicBaseUrl"]); endpoint != "" {
			if err := validatePublicWebhookURL(endpoint); err != nil {
				writeErr(w, http.StatusBadRequest, "publicBaseUrl "+err.Error())
				return
			}
		}
	} else if provider == "s3" {
		for _, key := range []string{"endpoint", "bucket"} {
			if strings.TrimSpace(req.Config[key]) == "" {
				writeErr(w, http.StatusBadRequest, key+" is required")
				return
			}
		}
		if endpoint := strings.TrimSpace(req.Config["endpoint"]); endpoint != "" {
			if !strings.HasPrefix(endpoint, "http://") && !strings.HasPrefix(endpoint, "https://") {
				endpoint = "https://" + endpoint
			}
			if err := validatePublicWebhookURL(endpoint); err != nil {
				writeErr(w, http.StatusBadRequest, "endpoint "+err.Error())
				return
			}
		}
	} else if provider == "git" {
		kind := strings.ToLower(strings.TrimSpace(req.Config["kind"]))
		if kind != "github" && kind != "gitlab" && kind != "gitea" {
			writeErr(w, http.StatusBadRequest, "git kind must be github, gitlab or gitea")
			return
		}
		req.Config["kind"] = kind
		for _, key := range []string{"owner", "repo"} {
			if strings.TrimSpace(req.Config[key]) == "" {
				writeErr(w, http.StatusBadRequest, key+" is required")
				return
			}
		}
		if strings.TrimSpace(req.Config["branch"]) == "" {
			req.Config["branch"] = "main"
		}
		if strings.TrimSpace(req.Config["path"]) == "" {
			req.Config["path"] = "docs"
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
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	set := bson.M{
		"workspaceId": wsID, "provider": provider, "config": req.Config,
		"events": req.Events, "disabled": !enabled, "updatedAt": now,
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
		if (provider == "ssh" || provider == "git" || provider == "jira" || provider == "confluence" || provider == "s3" || provider == "aliyun_oss" || provider == "qiniu" || provider == "tencent_cos" || provider == "notion" || provider == "yuque" || provider == "feishu") && strings.TrimSpace(req.Secret) == "" {
			writeErr(w, http.StatusBadRequest, "a private key or access token is required")
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
	_, actorName := s.editorFor(r)
	s.writeAudit(r.Context(), wsID, currentUserID(r), actorName, primitive.NilObjectID, "",
		"integration.save", "integration", saved.ID.Hex(), "Saved "+provider+" integration")
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
	_, actorName := s.editorFor(r)
	s.writeAudit(r.Context(), wsID, currentUserID(r), actorName, primitive.NilObjectID, "",
		"integration.delete", "integration", provider, "Removed "+provider+" integration")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) replayDelivery(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	_, role, err := s.accessibleWorkspace(r, wsID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	if role != roleOwner {
		writeErr(w, http.StatusForbidden, "only the workspace owner can replay webhooks")
		return
	}
	deliveryID, err := primitive.ObjectIDFromHex(chiURLParam(r, "deliveryID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid delivery id")
		return
	}
	if err := s.webhooks.Replay(r.Context(), wsID, deliveryID); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	w.WriteHeader(http.StatusAccepted)
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
	if integration.Disabled {
		writeErr(w, http.StatusBadRequest, "SSH publishing is disabled")
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

type gitPublishRequest struct {
	PageID          string `json:"pageId"`
	IncludeChildren bool   `json:"includeChildren"`
}

func (s *Server) publishGit(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	var req gitPublishRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	pages, page, ok := s.publishPages(w, r, wsID, req.PageID, req.IncludeChildren)
	if !ok {
		return
	}
	var integration model.Integration
	if err := s.store.Integrations.FindOne(r.Context(), bson.M{"workspaceId": wsID, "provider": "git"}).Decode(&integration); err != nil {
		writeErr(w, http.StatusBadRequest, "configure Git publishing in Settings → Integrations first")
		return
	}
	if integration.Disabled {
		writeErr(w, http.StatusBadRequest, "Git publishing is disabled")
		return
	}
	token, err := secret.Decrypt(s.cfg.EncryptionKey, integration.SecretCipher)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "the Git token could not be decrypted; save it again")
		return
	}
	files, err := staticpublish.Render(page.ID, pages, integration.Config["publicBaseUrl"])
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not render page")
		return
	}
	cfg := gitpublish.Config{
		Kind: integration.Config["kind"], BaseURL: integration.Config["baseUrl"],
		Owner: integration.Config["owner"], Repo: integration.Config["repo"],
		Branch: integration.Config["branch"], Path: integration.Config["path"],
		Token: token, PublicBase: integration.Config["publicBaseUrl"],
	}
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	count, err := gitpublish.Publish(ctx, cfg, files)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "Git publish failed: "+err.Error())
		return
	}
	publicURL := gitpublish.New(cfg).PublicURL()
	s.webhooks.Emit(r.Context(), wsID, "page.published", map[string]any{
		"pageId": page.ID.Hex(), "pageTitle": page.Title, "provider": cfg.Kind,
		"url": publicURL, "fileCount": count,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"provider": cfg.Kind, "pageId": page.ID.Hex(), "url": publicURL, "fileCount": count,
	})
}

func (s *Server) publishPages(w http.ResponseWriter, r *http.Request, wsID primitive.ObjectID, pageIDHex string, includeChildren bool) ([]model.Page, model.Page, bool) {
	pageID, err := primitive.ObjectIDFromHex(strings.TrimSpace(pageIDHex))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return nil, model.Page{}, false
	}
	page, role, err := s.accessiblePage(r, pageID)
	if err != nil || page.WorkspaceID != wsID {
		writeErr(w, http.StatusNotFound, "page not found")
		return nil, model.Page{}, false
	}
	if !canEdit(role) {
		writeErr(w, http.StatusForbidden, "you do not have permission to publish this page")
		return nil, model.Page{}, false
	}
	pages := []model.Page{page}
	if !includeChildren {
		page = s.applyLayout(r.Context(), page)
		pages[0] = page
		return pages, page, true
	}
	cur, err := s.store.Pages.Find(r.Context(), bson.M{"workspaceId": wsID, "archived": false})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load child pages")
		return nil, model.Page{}, false
	}
	defer cur.Close(r.Context())
	var all []model.Page
	if err := cur.All(r.Context(), &all); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load child pages")
		return nil, model.Page{}, false
	}
	children := map[primitive.ObjectID][]model.Page{}
	for _, item := range all {
		if item.ParentID != nil {
			children[*item.ParentID] = append(children[*item.ParentID], item)
		}
	}
	pages = pages[:0]
	seen := map[primitive.ObjectID]bool{}
	var walk func(model.Page)
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
	for index := range pages {
		pages[index] = s.applyLayout(r.Context(), pages[index])
	}
	return pages, page, true
}

func (s *Server) publishJira(w http.ResponseWriter, r *http.Request) {
	s.publishAtlassian(w, r, "jira")
}

func (s *Server) publishConfluence(w http.ResponseWriter, r *http.Request) {
	s.publishAtlassian(w, r, "confluence")
}

func (s *Server) publishAtlassian(w http.ResponseWriter, r *http.Request, provider string) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	var req struct {
		PageID string `json:"pageId"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	pages, page, ok := s.publishPages(w, r, wsID, req.PageID, false)
	if !ok || len(pages) == 0 {
		return
	}
	var integration model.Integration
	if err := s.store.Integrations.FindOne(r.Context(), bson.M{"workspaceId": wsID, "provider": provider}).Decode(&integration); err != nil {
		writeErr(w, http.StatusBadRequest, "configure "+provider+" in Settings → Integrations first")
		return
	}
	if integration.Disabled {
		writeErr(w, http.StatusBadRequest, provider+" publishing is disabled")
		return
	}
	token, err := secret.Decrypt(s.cfg.EncryptionKey, integration.SecretCipher)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "the Atlassian token could not be decrypted; save it again")
		return
	}
	client := atlassian.New(atlassian.Config{
		SiteURL: integration.Config["siteUrl"], Email: integration.Config["email"], Token: token,
		ProjectKey: integration.Config["projectKey"], IssueType: integration.Config["issueType"],
		IssueKey: integration.Config["issueKey"], SpaceID: integration.Config["spaceId"],
		PageID: integration.Config["pageId"], ParentID: integration.Config["parentId"],
	})
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()
	var externalID, publicURL string
	if provider == "jira" {
		externalID, publicURL, err = client.PublishIssue(ctx, page.Title, adf.Document(page))
	} else {
		externalID, publicURL, err = client.PublishConfluencePage(ctx, page.Title, adf.Document(page))
	}
	if err != nil {
		writeErr(w, http.StatusBadGateway, "Atlassian publish failed: "+err.Error())
		return
	}
	s.webhooks.Emit(r.Context(), wsID, "page.published", map[string]any{
		"pageId": page.ID.Hex(), "pageTitle": page.Title, "provider": provider,
		"url": publicURL, "externalId": externalID,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"provider": provider, "pageId": page.ID.Hex(), "url": publicURL, "externalId": externalID,
	})
}

func (s *Server) publishS3(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	var req struct {
		PageID          string `json:"pageId"`
		IncludeChildren bool   `json:"includeChildren"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	pages, page, ok := s.publishPages(w, r, wsID, req.PageID, req.IncludeChildren)
	if !ok {
		return
	}
	storage, provider, publicBase, err := s.storageFor(r.Context(), wsID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "storage credentials could not be decrypted; save them again")
		return
	}
	if storage == nil {
		writeErr(w, http.StatusBadRequest, "configure object storage in Settings → Integrations first")
		return
	}

	files, err := staticpublish.Render(page.ID, pages, publicBase)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not render page")
		return
	}
	count := 0
	for name, content := range files {
		contentType := mime.TypeByExtension(path.Ext(name))
		if contentType == "" {
			contentType = "text/html; charset=utf-8"
		}
		if _, err := storage.Put(r.Context(), name, content, contentType); err != nil {
			writeErr(w, http.StatusBadGateway, "object storage publish failed: "+err.Error())
			return
		}
		count++
	}
	url := publicBase + "/"
	if publicBase == "" {
		url = ""
	}
	s.webhooks.Emit(r.Context(), wsID, "page.published", map[string]any{
		"pageId": page.ID.Hex(), "pageTitle": page.Title, "provider": provider, "url": url, "fileCount": count,
	})
	writeJSON(w, http.StatusOK, map[string]any{"provider": provider, "pageId": page.ID.Hex(), "url": url, "fileCount": count})
}

func (s *Server) testIntegration(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	provider := strings.ToLower(strings.TrimSpace(chiURLParam(r, "provider")))
	var integration model.Integration
	if err := s.store.Integrations.FindOne(r.Context(), bson.M{"workspaceId": wsID, "provider": provider}).Decode(&integration); err != nil {
		writeErr(w, http.StatusBadRequest, "save this integration before testing it")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	start := time.Now()
	switch provider {
	case "webhook":
		err = s.webhooks.Test(ctx, integration)
	case "ssh":
		var key string
		key, err = secret.Decrypt(s.cfg.EncryptionKey, integration.SecretCipher)
		if err == nil {
			err = sshpub.Test(ctx, sshpub.Config{
				Host: integration.Config["host"], Port: integration.Config["port"],
				Username: integration.Config["username"], PrivateKey: key,
				RemotePath: integration.Config["remotePath"], HostFingerprint: integration.Config["hostFingerprint"],
			})
		}
	case "git":
		var token string
		token, err = secret.Decrypt(s.cfg.EncryptionKey, integration.SecretCipher)
		if err == nil {
			err = gitpublish.Test(ctx, gitpublish.Config{
				Kind: integration.Config["kind"], BaseURL: integration.Config["baseUrl"],
				Owner: integration.Config["owner"], Repo: integration.Config["repo"],
				Branch: integration.Config["branch"], Path: integration.Config["path"], Token: token,
			})
		}
	case "jira", "confluence":
		var token string
		token, err = secret.Decrypt(s.cfg.EncryptionKey, integration.SecretCipher)
		if err == nil {
			client := atlassian.New(atlassian.Config{
				SiteURL: integration.Config["siteUrl"], Email: integration.Config["email"], Token: token,
				ProjectKey: integration.Config["projectKey"], IssueType: integration.Config["issueType"],
				SpaceID: integration.Config["spaceId"], PageID: integration.Config["pageId"],
			})
			err = client.Test(ctx, provider)
		}
	case "s3", "aliyun_oss", "qiniu", "tencent_cos":
		var value string
		value, err = secret.Decrypt(s.cfg.EncryptionKey, integration.SecretCipher)
		if err == nil {
			parts := strings.SplitN(value, "\n", 2)
			if len(parts) != 2 {
				err = errors.New("storage credentials are incomplete")
			} else if provider == "aliyun_oss" {
				err = objectstore.TestAliyunOSS(ctx, objectstore.AliyunOSSConfig{
					Endpoint: integration.Config["endpoint"], Bucket: integration.Config["bucket"],
					AccessKey: parts[0], SecretKey: parts[1], Prefix: integration.Config["prefix"],
					PublicBase: integration.Config["publicBaseUrl"],
				})
			} else if provider == "tencent_cos" {
				err = objectstore.TestTencentCOS(ctx, objectstore.TencentCOSConfig{
					Bucket: integration.Config["bucket"], Region: integration.Config["region"],
					SecretID: parts[0], SecretKey: parts[1], Endpoint: integration.Config["endpoint"],
					Prefix: integration.Config["prefix"], PublicBase: integration.Config["publicBaseUrl"],
				})
			} else if provider == "qiniu" {
				err = objectstore.TestQiniu(ctx, objectstore.QiniuConfig{
					Bucket: integration.Config["bucket"], AccessKey: parts[0], SecretKey: parts[1],
					Prefix: integration.Config["prefix"], PublicBase: integration.Config["publicBaseUrl"],
					UseHTTPS: integration.Config["useHTTPS"] != "false",
				})
			} else {
				err = objectstore.Test(ctx, objectstore.S3Config{
					Endpoint: integration.Config["endpoint"], AccessKey: parts[0], SecretKey: parts[1],
					Bucket: integration.Config["bucket"], Region: integration.Config["region"],
					Prefix: integration.Config["prefix"], PublicBase: integration.Config["publicBaseUrl"],
					UseSSL: integration.Config["useSSL"] != "false",
				})
			}
		}
	case "notion":
		var token string
		token, err = secret.Decrypt(s.cfg.EncryptionKey, integration.SecretCipher)
		if err == nil {
			err = importer.TestNotionToken(ctx, token)
		}
	case "yuque":
		var token string
		token, err = secret.Decrypt(s.cfg.EncryptionKey, integration.SecretCipher)
		if err == nil {
			err = importer.TestYuqueToken(ctx, token)
		}
	case "feishu":
		var appSecret string
		appSecret, err = secret.Decrypt(s.cfg.EncryptionKey, integration.SecretCipher)
		if err == nil {
			err = importer.TestFeishu(ctx, integration.Config["appId"], appSecret)
		}
	default:
		writeErr(w, http.StatusBadRequest, "unsupported integration provider")
		return
	}
	if err != nil {
		writeErr(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "message": "Connection works", "latencyMs": time.Since(start).Milliseconds()})
}

// storageFor returns the first enabled object storage backend for a workspace.
func (s *Server) storageFor(ctx context.Context, workspaceID primitive.ObjectID) (objectstore.Putter, string, string, error) {
	for _, provider := range []string{"aliyun_oss", "qiniu", "tencent_cos", "s3"} {
		var integration model.Integration
		if err := s.store.Integrations.FindOne(ctx, bson.M{
			"workspaceId": workspaceID, "provider": provider, "disabled": bson.M{"$ne": true},
		}).Decode(&integration); err != nil {
			continue
		}
		value, err := secret.Decrypt(s.cfg.EncryptionKey, integration.SecretCipher)
		if err != nil {
			return nil, "", "", err
		}
		parts := strings.SplitN(value, "\n", 2)
		if len(parts) != 2 {
			return nil, "", "", errors.New("storage credentials are incomplete")
		}
		publicBase := strings.TrimRight(integration.Config["publicBaseUrl"], "/")
		switch provider {
		case "aliyun_oss":
			store, err := objectstore.NewAliyunOSS(objectstore.AliyunOSSConfig{
				Endpoint: integration.Config["endpoint"], Bucket: integration.Config["bucket"],
				AccessKey: parts[0], SecretKey: parts[1], Prefix: integration.Config["prefix"], PublicBase: publicBase,
			})
			return store, provider, publicBase, err
		case "tencent_cos":
			store, err := objectstore.NewTencentCOS(objectstore.TencentCOSConfig{
				Bucket: integration.Config["bucket"], Region: integration.Config["region"],
				SecretID: parts[0], SecretKey: parts[1], Endpoint: integration.Config["endpoint"],
				Prefix: integration.Config["prefix"], PublicBase: publicBase,
			})
			return store, provider, publicBase, err
		case "qiniu":
			store, err := objectstore.NewQiniu(objectstore.QiniuConfig{
				Bucket: integration.Config["bucket"], AccessKey: parts[0], SecretKey: parts[1],
				Prefix: integration.Config["prefix"], PublicBase: publicBase,
				UseHTTPS: integration.Config["useHTTPS"] != "false",
			})
			return store, provider, publicBase, err
		default:
			store, err := objectstore.NewS3(ctx, objectstore.S3Config{
				Endpoint: integration.Config["endpoint"], AccessKey: parts[0], SecretKey: parts[1],
				Bucket: integration.Config["bucket"], Region: integration.Config["region"],
				Prefix: integration.Config["prefix"], PublicBase: publicBase,
				UseSSL: integration.Config["useSSL"] != "false",
			})
			return store, provider, publicBase, err
		}
	}
	return nil, "", "", nil
}
