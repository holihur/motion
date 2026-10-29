package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/importer"
	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/secret"
)

func (s *Server) loadImportSecret(w http.ResponseWriter, r *http.Request, wsID primitive.ObjectID, provider string) (model.Integration, string, bool) {
	var integration model.Integration
	if err := s.store.Integrations.FindOne(r.Context(), bson.M{"workspaceId": wsID, "provider": provider}).Decode(&integration); err != nil {
		writeErr(w, http.StatusBadRequest, "configure "+provider+" import first (token not saved)")
		return integration, "", false
	}
	if integration.Disabled {
		writeErr(w, http.StatusBadRequest, provider+" import is disabled")
		return integration, "", false
	}
	token, err := secret.Decrypt(s.cfg.EncryptionKey, integration.SecretCipher)
	if err != nil || strings.TrimSpace(token) == "" {
		writeErr(w, http.StatusBadRequest, "the "+provider+" token is missing; save it again")
		return integration, "", false
	}
	return integration, token, true
}

// POST /workspaces/{workspaceID}/integrations/notion/import  {page}
func (s *Server) importNotion(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	var req struct {
		Page string `json:"page"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Page) == "" {
		writeErr(w, http.StatusBadRequest, "a notion page link or id is required")
		return
	}
	_, token, ok := s.loadImportSecret(w, r, wsID, "notion")
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	result, err := importer.ImportNotionPage(ctx, token, req.Page)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "Notion import failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// POST /workspaces/{workspaceID}/integrations/yuque/import  {doc}
func (s *Server) importYuque(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	var req struct {
		Doc string `json:"doc"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Doc) == "" {
		writeErr(w, http.StatusBadRequest, "a yuque doc link is required")
		return
	}
	_, token, ok := s.loadImportSecret(w, r, wsID, "yuque")
	if !ok {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	result, err := importer.ImportYuqueDoc(ctx, token, req.Doc)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "Yuque import failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// POST /workspaces/{workspaceID}/integrations/feishu/import  {doc}
func (s *Server) importFeishu(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	var req struct {
		Doc string `json:"doc"`
	}
	if err := decodeJSON(r, &req); err != nil || strings.TrimSpace(req.Doc) == "" {
		writeErr(w, http.StatusBadRequest, "a feishu document link or id is required")
		return
	}
	integration, appSecret, ok := s.loadImportSecret(w, r, wsID, "feishu")
	if !ok {
		return
	}
	appID := strings.TrimSpace(integration.Config["appId"])
	if appID == "" {
		writeErr(w, http.StatusBadRequest, "feishu app id is not configured")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	result, err := importer.ImportFeishuDoc(ctx, appID, appSecret, req.Doc)
	if err != nil {
		writeErr(w, http.StatusBadGateway, "Feishu import failed: "+err.Error())
		return
	}
	writeJSON(w, http.StatusOK, result)
}
