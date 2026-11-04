package httpapi

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/gitpublish"
	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/secret"
	"github.com/motion/server/internal/version"
)

type feedbackRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	Category    string `json:"category"`
	PageID      string `json:"pageId"`
	URL         string `json:"url"`
	OS          string `json:"os"`
	Browser     string `json:"browser"`
	Language    string `json:"language"`
	Viewport    string `json:"viewport"`
}

// POST /workspaces/{workspaceID}/feedback
// Creates an issue in the workspace's configured Git repository.
func (s *Server) createFeedback(w http.ResponseWriter, r *http.Request) {
	wsID := objectIDFromParam(r, "workspaceID")
	if wsID.IsZero() {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	ws, _, err := s.accessibleWorkspace(r, wsID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	var req feedbackRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	title := truncateRunes(strings.TrimSpace(req.Title), 200)
	description := truncateRunes(strings.TrimSpace(req.Description), 10000)
	if title == "" || description == "" {
		writeErr(w, http.StatusBadRequest, "title and description are required")
		return
	}
	category := truncateRunes(strings.TrimSpace(req.Category), 40)
	if category == "" {
		category = "General"
	}
	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": currentUserID(r)}).Decode(&user); err != nil {
		writeErr(w, http.StatusUnauthorized, "account no longer exists")
		return
	}
	pageTitle := ""
	pageHex := strings.TrimSpace(req.PageID)
	if pageHex != "" {
		pageID, err := primitive.ObjectIDFromHex(pageHex)
		if err == nil {
			if page, _, err := s.accessiblePageFor(r.Context(), pageID, user.ID); err == nil && page.WorkspaceID == wsID {
				pageTitle = page.Title
			}
		}
	}
	var integration model.Integration
	if err := s.store.Integrations.FindOne(r.Context(), bson.M{"workspaceId": wsID, "provider": "git"}).Decode(&integration); err != nil {
		writeErr(w, http.StatusBadRequest, "configure Git integration in Settings → Integrations first")
		return
	}
	if integration.Disabled {
		writeErr(w, http.StatusBadRequest, "Git integration is disabled")
		return
	}
	kind := strings.ToLower(strings.TrimSpace(integration.Config["kind"]))
	owner := strings.TrimSpace(integration.Config["owner"])
	repo := strings.TrimSpace(integration.Config["repo"])
	if kind == "" || owner == "" || repo == "" {
		writeErr(w, http.StatusBadRequest, "Git owner and repository are not configured")
		return
	}
	token, err := secret.Decrypt(s.cfg.EncryptionKey, integration.SecretCipher)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "the Git token could not be decrypted; save it again")
		return
	}
	clientOS := truncateRunes(strings.TrimSpace(req.OS), 100)
	if clientOS == "" {
		clientOS = "Unknown"
	}
	clientBrowser := truncateRunes(strings.TrimSpace(req.Browser), 100)
	if clientBrowser == "" {
		clientBrowser = "Unknown"
	}
	clientLanguage := truncateRunes(strings.TrimSpace(req.Language), 40)
	clientViewport := truncateRunes(strings.TrimSpace(req.Viewport), 40)
	body := fmt.Sprintf("### Feedback\n\n%s\n\n---\n\n**Category:** %s\n**Submitted by:** %s <%s>\n**Workspace:** %s\n**Version:** %s\n**OS:** %s\n**Browser:** %s\n", description, category, user.Name, user.Email, ws.Name, version.Version, clientOS, clientBrowser)
	if clientLanguage != "" {
		body += "**Language:** " + clientLanguage + "\n"
	}
	if clientViewport != "" {
		body += "**Viewport:** " + clientViewport + "\n"
	}
	if pageTitle != "" {
		body += fmt.Sprintf("**Page:** %s (`%s`)\n", pageTitle, pageHex)
	}
	if sourceURL := truncateRunes(strings.TrimSpace(req.URL), 2000); sourceURL != "" {
		body += "**URL:** " + sourceURL + "\n"
	}
	if agent := truncateRunes(strings.TrimSpace(r.UserAgent()), 500); agent != "" {
		body += "**User agent:** " + agent + "\n"
	}
	body += "\n<!-- Submitted from Motion feedback -->"
	client := gitpublish.New(gitpublish.Config{
		Kind: kind, BaseURL: integration.Config["baseUrl"],
		Owner: owner, Repo: repo, Token: token,
	})
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	url, err := client.CreateIssue(ctx, "[Feedback] "+title, body)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "could not create Git issue: "+err.Error())
		return
	}
	s.writeAudit(r.Context(), wsID, user.ID, user.Name, primitive.NilObjectID, "",
		"feedback.issue", "workspace", wsID.Hex(), "Created feedback issue: "+title)
	s.webhooks.Emit(r.Context(), wsID, "feedback.created", map[string]any{
		"title": title, "url": url, "category": category, "pageId": pageHex,
	})
	writeJSON(w, http.StatusCreated, map[string]string{"url": url})
}
