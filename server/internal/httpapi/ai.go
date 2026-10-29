package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	adkmodel "google.golang.org/adk/model"
	"google.golang.org/adk/model/gemini"
	"google.golang.org/genai"

	"github.com/motion/server/internal/docagent"
	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/openaimodel"
	"github.com/motion/server/internal/secret"
)

type aiProvider struct {
	Label        string `json:"label"`
	DefaultBase  string `json:"defaultBaseUrl"`
	DefaultModel string `json:"defaultModel"`
	KeyRequired  bool   `json:"keyRequired"`
}

var aiProviders = map[string]aiProvider{
	"deepseek":   {Label: "DeepSeek", DefaultBase: "https://api.deepseek.com", DefaultModel: "deepseek-chat", KeyRequired: true},
	"openai":     {Label: "OpenAI", DefaultBase: "https://api.openai.com/v1", DefaultModel: "gpt-5-mini", KeyRequired: true},
	"openrouter": {Label: "OpenRouter", DefaultBase: "https://openrouter.ai/api/v1", DefaultModel: "openai/gpt-5-mini", KeyRequired: true},
	"groq":       {Label: "Groq", DefaultBase: "https://api.groq.com/openai/v1", DefaultModel: "openai/gpt-oss-120b", KeyRequired: true},
	"ollama":     {Label: "Ollama (local)", DefaultBase: "http://localhost:11434/v1", DefaultModel: "qwen3:8b", KeyRequired: false},
	"custom":     {Label: "Custom OpenAI-compatible", DefaultBase: "", DefaultModel: "", KeyRequired: true},
	"gemini":     {Label: "Google Gemini (ADK native)", DefaultBase: "", DefaultModel: "gemini-flash-lite-latest", KeyRequired: true},
}

type aiSettingsView struct {
	Configured    bool   `json:"configured"`
	Provider      string `json:"provider"`
	ProviderLabel string `json:"providerLabel"`
	Model         string `json:"model"`
	BaseURL       string `json:"baseUrl"`
	KeyHint       string `json:"keyHint,omitempty"`
	UpdatedAt     string `json:"updatedAt,omitempty"`
}

func (s *Server) aiSetting(r *http.Request) (model.AISetting, error) {
	var setting model.AISetting
	err := s.store.AISettings.FindOne(r.Context(), bson.M{"userId": currentUserID(r)}).Decode(&setting)
	return setting, err
}

func aiDefaultModel(provider, siteModel string) string {
	if provider == "gemini" && siteModel != "" {
		return siteModel
	}
	return aiProviders[provider].DefaultModel
}

func aiConfigured(setting model.AISetting) bool {
	provider, ok := aiProviders[setting.Provider]
	if !ok {
		return false
	}
	if provider.KeyRequired && setting.KeyCipher == "" {
		return false
	}
	return true
}

func aiView(setting model.AISetting, siteModel string) aiSettingsView {
	provider := setting.Provider
	if provider == "" {
		provider = "deepseek"
	}
	info := aiProviders[provider]
	modelName := setting.Model
	if modelName == "" {
		modelName = aiDefaultModel(provider, siteModel)
	}
	base := setting.BaseURL
	if base == "" {
		base = info.DefaultBase
	}
	return aiSettingsView{
		Configured: aiConfigured(setting), Provider: provider, ProviderLabel: info.Label,
		Model: modelName, BaseURL: base, KeyHint: setting.KeyHint,
		UpdatedAt: setting.UpdatedAt.Format(time.RFC3339),
	}
}

func (s *Server) getAISettings(w http.ResponseWriter, r *http.Request) {
	if currentAuth(r).Method != "jwt" {
		writeErr(w, http.StatusForbidden, "AI settings can only be managed from a signed-in session")
		return
	}
	setting, err := s.aiSetting(r)
	if err == mongo.ErrNoDocuments {
		provider := "deepseek"
		writeJSON(w, http.StatusOK, aiSettingsView{
			Configured: false, Provider: provider, ProviderLabel: aiProviders[provider].Label,
			Model: aiDefaultModel(provider, s.siteSnapshot().AIModel), BaseURL: aiProviders[provider].DefaultBase,
		})
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load AI settings")
		return
	}
	writeJSON(w, http.StatusOK, aiView(setting, s.siteSnapshot().AIModel))
}

type aiSettingsRequest struct {
	Provider *string `json:"provider"`
	APIKey   *string `json:"apiKey"`
	Model    *string `json:"model"`
	BaseURL  *string `json:"baseUrl"`
}

func (s *Server) saveAISettings(w http.ResponseWriter, r *http.Request) {
	if currentAuth(r).Method != "jwt" {
		writeErr(w, http.StatusForbidden, "AI settings can only be managed from a signed-in session")
		return
	}
	var req aiSettingsRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	existing, err := s.aiSetting(r)
	if err != nil && err != mongo.ErrNoDocuments {
		writeErr(w, http.StatusInternalServerError, "could not load AI settings")
		return
	}
	now := time.Now().UTC()
	setting := existing
	setting.UserID = currentUserID(r)
	if setting.ID.IsZero() {
		setting.ID = primitive.NewObjectID()
		setting.CreatedAt = now
		setting.Provider = "deepseek"
	}
	oldProvider := setting.Provider
	if req.Provider != nil {
		provider := strings.ToLower(strings.TrimSpace(*req.Provider))
		info, ok := aiProviders[provider]
		if !ok {
			writeErr(w, http.StatusBadRequest, "unsupported AI provider")
			return
		}
		setting.Provider = provider
		if provider != oldProvider && setting.Model == "" {
			setting.Model = aiDefaultModel(provider, s.siteSnapshot().AIModel)
		}
		if provider != oldProvider && setting.BaseURL == "" {
			setting.BaseURL = info.DefaultBase
		}
	}
	info, ok := aiProviders[setting.Provider]
	if !ok {
		writeErr(w, http.StatusBadRequest, "unsupported AI provider")
		return
	}

	if req.BaseURL != nil {
		setting.BaseURL = strings.TrimRight(strings.TrimSpace(*req.BaseURL), "/")
	}
	if setting.BaseURL == "" {
		setting.BaseURL = info.DefaultBase
	}
	if setting.BaseURL == "" && setting.Provider != "gemini" {
		writeErr(w, http.StatusBadRequest, "this provider requires a base URL")
		return
	}
	if req.Model != nil {
		setting.Model = strings.TrimSpace(*req.Model)
	}
	if setting.Model == "" {
		setting.Model = aiDefaultModel(setting.Provider, s.siteSnapshot().AIModel)
	}
	if len(setting.Model) > 120 {
		writeErr(w, http.StatusBadRequest, "model name is too long")
		return
	}

	if req.APIKey != nil {
		key := strings.TrimSpace(*req.APIKey)
		if key != "" {
			if len(key) > 500 {
				writeErr(w, http.StatusBadRequest, "API key is too long")
				return
			}
			encrypted, err := secret.Encrypt(s.cfg.EncryptionKey, key)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "could not secure API key")
				return
			}
			setting.KeyCipher = encrypted
			if len(key) > 4 {
				setting.KeyHint = "…" + key[len(key)-4:]
			} else {
				setting.KeyHint = "…"
			}
		} else if info.KeyRequired && setting.Provider != oldProvider {
			writeErr(w, http.StatusBadRequest, "enter an API key for "+info.Label)
			return
		}
	}
	if info.KeyRequired && setting.KeyCipher == "" {
		writeErr(w, http.StatusBadRequest, "an API key is required for "+info.Label)
		return
	}
	if !info.KeyRequired && setting.Provider == "ollama" && req.APIKey != nil && strings.TrimSpace(*req.APIKey) == "" {
		setting.KeyCipher = ""
		setting.KeyHint = ""
	}
	setting.UpdatedAt = now
	if _, err := s.store.AISettings.UpdateOne(r.Context(),
		bson.M{"userId": currentUserID(r)},
		bson.M{"$set": setting},
		options.Update().SetUpsert(true),
	); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save AI settings")
		return
	}
	writeJSON(w, http.StatusOK, aiView(setting, s.siteSnapshot().AIModel))
}

func (s *Server) deleteAISettings(w http.ResponseWriter, r *http.Request) {
	if currentAuth(r).Method != "jwt" {
		writeErr(w, http.StatusForbidden, "AI settings can only be managed from a signed-in session")
		return
	}
	if _, err := s.store.AISettings.DeleteOne(r.Context(), bson.M{"userId": currentUserID(r)}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not remove AI settings")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) aiWorkspaceFor(r *http.Request, pageID string) (primitive.ObjectID, string, bool) {
	if strings.TrimSpace(pageID) != "" {
		if id, err := primitive.ObjectIDFromHex(pageID); err == nil {
			if page, _, err := s.accessiblePage(r, id); err == nil {
				return page.WorkspaceID, "", true
			}
		}
	}
	cur, err := s.store.Workspaces.Find(r.Context(), bson.M{
		"$or": []bson.M{{"ownerId": currentUserID(r)}, {"members.userId": currentUserID(r)}},
	}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}).SetLimit(1))
	if err != nil {
		return primitive.NilObjectID, "", false
	}
	defer cur.Close(r.Context())
	var workspaces []model.Workspace
	if err := cur.All(r.Context(), &workspaces); err != nil || len(workspaces) == 0 {
		return primitive.NilObjectID, "", false
	}
	return workspaces[0].ID, "", true
}

func (s *Server) aiStatus(w http.ResponseWriter, r *http.Request) {
	workspaceID, _, _ := s.aiWorkspaceFor(r, r.URL.Query().Get("pageId"))
	agentsPageID := ""
	if !workspaceID.IsZero() {
		if agents, ok := docagent.FindAgentsPage(r.Context(), s.store, workspaceID); ok {
			agentsPageID = agents.ID.Hex()
		}
	}
	setting, err := s.aiSetting(r)
	if err == mongo.ErrNoDocuments {
		writeJSON(w, http.StatusOK, map[string]any{
			"configured": false, "provider": "deepseek", "model": aiDefaultModel("deepseek", s.siteSnapshot().AIModel),
			"agentsPageId": agentsPageID,
		})
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load AI status")
		return
	}
	view := aiView(setting, s.siteSnapshot().AIModel)
	writeJSON(w, http.StatusOK, map[string]any{
		"configured": view.Configured, "provider": view.Provider,
		"providerLabel": view.ProviderLabel, "model": view.Model,
		"agentsPageId": agentsPageID,
	})
}

type aiTestResponse struct {
	OK        bool   `json:"ok"`
	Model     string `json:"model"`
	Message   string `json:"message"`
	LatencyMS int64  `json:"latencyMs"`
}

func (s *Server) testAISettings(w http.ResponseWriter, r *http.Request) {
	setting, err := s.aiSetting(r)
	if err == mongo.ErrNoDocuments {
		writeErr(w, http.StatusBadRequest, "save your AI provider first")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load AI settings")
		return
	}
	if !aiConfigured(setting) {
		writeErr(w, http.StatusBadRequest, "add your API key first")
		return
	}
	key := ""
	if setting.KeyCipher != "" {
		key, err = secret.Decrypt(s.cfg.EncryptionKey, setting.KeyCipher)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "could not read the saved API key; save it again")
			return
		}
	}
	modelName := setting.Model
	if modelName == "" {
		modelName = aiDefaultModel(setting.Provider, s.siteSnapshot().AIModel)
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	var llm adkmodel.LLM
	if setting.Provider == "gemini" {
		llm, err = gemini.NewModel(ctx, modelName, &genai.ClientConfig{APIKey: key})
		if err != nil {
			writeErr(w, http.StatusBadGateway, "could not initialise Gemini: "+err.Error())
			return
		}
	} else {
		llm = openaimodel.New(openaimodel.Config{
			Provider: setting.Provider, BaseURL: setting.BaseURL, APIKey: key, Model: modelName,
			Client: &http.Client{Timeout: 25 * time.Second},
		})
	}
	temperature := float32(0)
	req := &adkmodel.LLMRequest{
		Contents: []*genai.Content{{
			Role: "user", Parts: []*genai.Part{{Text: "Reply with the single word: OK"}},
		}},
		Config: &genai.GenerateContentConfig{Temperature: &temperature, MaxOutputTokens: 16},
	}
	started := time.Now()
	var reply strings.Builder
	for response, err := range llm.GenerateContent(ctx, req, false) {
		if err != nil {
			writeErr(w, http.StatusBadGateway, "AI connection failed: "+err.Error())
			return
		}
		if response == nil || response.Content == nil {
			continue
		}
		for _, part := range response.Content.Parts {
			if part != nil && part.Text != "" {
				reply.WriteString(part.Text)
			}
		}
	}
	message := strings.TrimSpace(reply.String())
	if message == "" {
		writeErr(w, http.StatusBadGateway, "the provider returned an empty response")
		return
	}
	writeJSON(w, http.StatusOK, aiTestResponse{
		OK: true, Model: modelName, Message: message,
		LatencyMS: time.Since(started).Milliseconds(),
	})
}

type aiChatRequest struct {
	Message string                 `json:"message"`
	PageID  string                 `json:"pageId,omitempty"`
	AgentID string                 `json:"agentId,omitempty"`
	History []docagent.ChatMessage `json:"history,omitempty"`
}

type aiChatResponse struct {
	Reply      string             `json:"reply"`
	Usage      docagent.Usage     `json:"usage"`
	Actions    []string           `json:"actions,omitempty"`
	Model      string             `json:"model"`
	Provider   string             `json:"provider"`
	RevisionID string             `json:"revisionId,omitempty"`
	AgentID    string             `json:"agentId,omitempty"`
	AgentName  string             `json:"agentName,omitempty"`
	Mode       string             `json:"mode,omitempty"`
	Proposals  []model.AIProposal `json:"proposals,omitempty"`
}

func (s *Server) aiChat(w http.ResponseWriter, r *http.Request) {
	var req aiChatRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" || len([]rune(req.Message)) > 12000 {
		writeErr(w, http.StatusBadRequest, "message must be between 1 and 12000 characters")
		return
	}
	if len(req.History) > 30 {
		req.History = req.History[len(req.History)-30:]
	}
	setting, err := s.aiSetting(r)
	if err == mongo.ErrNoDocuments {
		writeErr(w, http.StatusBadRequest, "configure your AI provider in Settings → AI first")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load AI settings")
		return
	}
	if !aiConfigured(setting) {
		writeErr(w, http.StatusBadRequest, "add your API key in Settings → AI first")
		return
	}
	key := ""
	if setting.KeyCipher != "" {
		key, err = secret.Decrypt(s.cfg.EncryptionKey, setting.KeyCipher)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "could not read the saved API key; save it again in Settings → AI")
			return
		}
	}
	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": currentUserID(r)}).Decode(&user); err != nil {
		writeErr(w, http.StatusUnauthorized, "account no longer exists")
		return
	}
	if s.aiBudgetExceeded(r.Context(), user.ID) {
		w.Header().Set("Retry-After", "3600")
		writeErr(w, http.StatusTooManyRequests, "daily AI token budget exceeded; try again tomorrow")
		return
	}
	timeout, cancel := context.WithTimeout(r.Context(), 90*time.Second)
	defer cancel()
	modelName := setting.Model
	if modelName == "" {
		modelName = aiDefaultModel(setting.Provider, s.siteSnapshot().AIModel)
	}
	revisionID := ""
	if pageHex := strings.TrimSpace(req.PageID); pageHex != "" {
		if pageID, err := primitive.ObjectIDFromHex(pageHex); err == nil {
			if page, _, err := s.accessiblePage(r, pageID); err == nil {
				if revision, err := s.createRevision(r, page, "Before Motion AI"); err == nil {
					revisionID = revision.ID.Hex()
				}
			}
		}
	}
	workspaceID, _, ok := s.aiWorkspaceFor(r, req.PageID)
	if !ok {
		writeErr(w, http.StatusBadRequest, "no workspace found")
		return
	}
	agentConfig, err := s.agentForRun(r.Context(), workspaceID, currentUserID(r), req.AgentID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "agent not found or disabled")
		return
	}
	agentScopes := make(map[string]bool, len(agentConfig.Scopes))
	for _, scope := range agentConfig.Scopes {
		agentScopes[scope] = true
	}
	agent := &docagent.Runner{
		Store: s.store, Hub: s.hub, User: user, Key: key,
		ModelName: modelName, Provider: setting.Provider, BaseURL: setting.BaseURL,
		Scopes: agentScopes, TrackChanges: agentConfig.Mode == "approval",
	}
	reply, actions, err := agent.Run(timeout, req.History, req.Message, strings.TrimSpace(req.PageID))
	if err != nil {
		writeErr(w, http.StatusBadGateway, "AI request failed: "+err.Error())
		return
	}
	s.recordAIUsage(r.Context(), user.ID, agent.LastUsage, req.Message, reply)
	proposals := []model.AIProposal{}
	if agentConfig.Mode == "approval" {
		proposals = s.finalizeApproval(r.Context(), agentConfig, agent, user, req.Message)
	}
	if len(proposals) > 0 {
		reply = strings.TrimSpace(reply) + fmt.Sprintf("\n\nPrepared %d change(s) for review in Agent Inbox.", len(proposals))
	}
	s.writeAudit(r.Context(), workspaceID, user.ID, user.Name, agentConfig.ID, agentConfig.Name,
		"agent.run", "agent", agentConfig.ID.Hex(), "Ran "+agentConfig.Name+" with "+fmt.Sprint(len(actions))+" action(s)")
	writeJSON(w, http.StatusOK, aiChatResponse{
		Reply: reply, Usage: agent.LastUsage, Actions: actions, Model: modelName, Provider: setting.Provider,
		RevisionID: revisionID, AgentID: agentConfig.ID.Hex(), AgentName: agentConfig.Name,
		Mode: agentConfig.Mode, Proposals: proposals,
	})
}

func (s *Server) aiChatStream(w http.ResponseWriter, r *http.Request) {
	var req aiChatRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Message = strings.TrimSpace(req.Message)
	if req.Message == "" || len([]rune(req.Message)) > 12000 {
		writeErr(w, http.StatusBadRequest, "message must be between 1 and 12000 characters")
		return
	}
	if len(req.History) > 30 {
		req.History = req.History[len(req.History)-30:]
	}
	setting, err := s.aiSetting(r)
	if err == mongo.ErrNoDocuments {
		writeErr(w, http.StatusBadRequest, "configure your AI provider in Settings → AI first")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load AI settings")
		return
	}
	if !aiConfigured(setting) {
		writeErr(w, http.StatusBadRequest, "add your API key in Settings → AI first")
		return
	}
	key := ""
	if setting.KeyCipher != "" {
		key, err = secret.Decrypt(s.cfg.EncryptionKey, setting.KeyCipher)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "could not read the saved API key; save it again in Settings → AI")
			return
		}
	}
	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": currentUserID(r)}).Decode(&user); err != nil {
		writeErr(w, http.StatusUnauthorized, "account no longer exists")
		return
	}
	if s.aiBudgetExceeded(r.Context(), user.ID) {
		w.Header().Set("Retry-After", "3600")
		writeErr(w, http.StatusTooManyRequests, "daily AI token budget exceeded; try again tomorrow")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, "streaming is not supported by this server")
		return
	}
	modelName := setting.Model
	if modelName == "" {
		modelName = aiDefaultModel(setting.Provider, s.siteSnapshot().AIModel)
	}
	revisionID := ""
	if pageHex := strings.TrimSpace(req.PageID); pageHex != "" {
		if pageID, err := primitive.ObjectIDFromHex(pageHex); err == nil {
			if page, _, err := s.accessiblePage(r, pageID); err == nil {
				if revision, err := s.createRevision(r, page, "Before Motion AI"); err == nil {
					revisionID = revision.ID.Hex()
				}
			}
		}
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	writeEvent := func(event string, data any) bool {
		payload, err := json.Marshal(data)
		if err != nil {
			return false
		}
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload); err != nil {
			return false
		}
		flusher.Flush()
		return true
	}
	if !writeEvent("meta", map[string]any{
		"model": modelName, "provider": setting.Provider, "revisionId": revisionID,
	}) {
		return
	}
	timeout, cancel := context.WithTimeout(r.Context(), 120*time.Second)
	defer cancel()
	workspaceID, _, ok := s.aiWorkspaceFor(r, req.PageID)
	if !ok {
		writeEvent("error", map[string]string{"error": "no workspace found"})
		return
	}
	if !aiRunLimiter.allow(currentUserID(r).Hex(), 20, time.Minute) {
		writeEvent("error", map[string]string{"error": "too many AI requests; try again in a minute"})
		return
	}
	agentConfig, err := s.agentForRun(r.Context(), workspaceID, currentUserID(r), req.AgentID)
	if err != nil {
		writeEvent("error", map[string]string{"error": "agent not found or disabled"})
		return
	}
	agentScopes := make(map[string]bool, len(agentConfig.Scopes))
	for _, scope := range agentConfig.Scopes {
		agentScopes[scope] = true
	}
	agent := &docagent.Runner{
		Store: s.store, Hub: s.hub, User: user, Key: key,
		ModelName: modelName, Provider: setting.Provider, BaseURL: setting.BaseURL,
		Scopes: agentScopes, TrackChanges: agentConfig.Mode == "approval",
	}
	reply, actions, err := agent.RunStream(timeout, req.History, req.Message, strings.TrimSpace(req.PageID),
		func(text string) bool {
			return writeEvent("token", map[string]string{"text": text})
		})
	if err != nil {
		if timeout.Err() != nil {
			writeEvent("error", map[string]string{"error": "AI request timed out"})
		} else {
			writeEvent("error", map[string]string{"error": "AI request failed: " + err.Error()})
		}
		return
	}
	s.recordAIUsage(r.Context(), user.ID, agent.LastUsage, req.Message, reply)
	proposals := []model.AIProposal{}
	if agentConfig.Mode == "approval" {
		proposals = s.finalizeApproval(r.Context(), agentConfig, agent, user, req.Message)
	}
	if len(proposals) > 0 {
		reply = strings.TrimSpace(reply) + fmt.Sprintf("\n\nPrepared %d change(s) for review in Agent Inbox.", len(proposals))
	}
	s.writeAudit(r.Context(), workspaceID, user.ID, user.Name, agentConfig.ID, agentConfig.Name,
		"agent.run", "agent", agentConfig.ID.Hex(), "Ran "+agentConfig.Name+" with "+fmt.Sprint(len(actions))+" action(s)")
	writeEvent("done", aiChatResponse{
		Reply: reply, Usage: agent.LastUsage, Actions: actions, Model: modelName, Provider: setting.Provider,
		RevisionID: revisionID, AgentID: agentConfig.ID.Hex(), AgentName: agentConfig.Name,
		Mode: agentConfig.Mode, Proposals: proposals,
	})
}

type agentsPageRequest struct {
	PageID string `json:"pageId"`
}

func (s *Server) createAgentsPage(w http.ResponseWriter, r *http.Request) {
	var req agentsPageRequest
	_ = decodeJSON(r, &req)
	workspaceID, _, ok := s.aiWorkspaceFor(r, req.PageID)
	if !ok {
		writeErr(w, http.StatusBadRequest, "no workspace found")
		return
	}
	workspace, role, err := s.accessibleWorkspaceFor(r.Context(), workspaceID, currentUserID(r))
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	if role == roleViewer {
		writeErr(w, http.StatusForbidden, "you only have view access")
		return
	}
	if existing, found := docagent.FindAgentsPage(r.Context(), s.store, workspace.ID); found {
		writeJSON(w, http.StatusOK, map[string]string{"pageId": existing.ID.Hex(), "title": existing.Title})
		return
	}
	template := "## How Motion AI should work here\n\n- Keep page titles short and specific.\n- Prefer appending to existing sections instead of rewriting them.\n- Turn meeting notes into clear decisions and action items.\n- Ask before changing anything destructive.\n"
	blocks := docagent.ParseMarkdown(template)
	order := float64(1024)
	var last model.Page
	if err := s.store.Pages.FindOne(r.Context(), bson.M{"workspaceId": workspace.ID, "parentId": nil}, options.FindOne().SetSort(bson.D{{Key: "order", Value: -1}})).Decode(&last); err == nil {
		order = last.Order + 1024
	}
	now := time.Now().UTC()
	page := model.Page{
		ID: primitive.NewObjectID(), WorkspaceID: workspace.ID, Title: "AGENTS.md", Icon: "🤖",
		Blocks: blocks, Text: docagent.TextFromBlocks(blocks), Order: order,
		CreatedBy: currentUserID(r), CreatedAt: now, UpdatedAt: now,
	}
	if _, err := s.store.Pages.InsertOne(r.Context(), page); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create AGENTS.md")
		return
	}
	s.broadcastTree(workspace.ID, clientID(r))
	writeJSON(w, http.StatusCreated, map[string]string{"pageId": page.ID.Hex(), "title": page.Title})
}
