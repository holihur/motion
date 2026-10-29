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

	"github.com/motion/server/internal/docagent"
	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/realtime"
	"github.com/motion/server/internal/secret"
)

func defaultAgentScopes() []string {
	return []string{"pages:read", "pages:write"}
}

func (s *Server) ensureDefaultAgent(ctx context.Context, workspaceID, ownerID primitive.ObjectID) (model.Agent, error) {
	var agent model.Agent
	err := s.store.Agents.FindOne(ctx, bson.M{"workspaceId": workspaceID, "isDefault": true}).Decode(&agent)
	if err == nil {
		return agent, nil
	}
	if err != mongo.ErrNoDocuments {
		return model.Agent{}, err
	}
	now := time.Now().UTC()
	agent = model.Agent{
		ID: primitive.NewObjectID(), WorkspaceID: workspaceID, OwnerID: ownerID,
		Name: "Motion AI", Icon: "✨", Description: "Your workspace document agent.",
		Mode: "approval", Scopes: defaultAgentScopes(), Enabled: true, IsDefault: true,
		CreatedAt: now, UpdatedAt: now,
	}
	if _, err := s.store.Agents.InsertOne(ctx, agent); err != nil {
		// Another request may have created it first.
		if findErr := s.store.Agents.FindOne(ctx, bson.M{"workspaceId": workspaceID, "isDefault": true}).Decode(&agent); findErr == nil {
			return agent, nil
		}
		return model.Agent{}, err
	}
	return agent, nil
}

func (s *Server) agentForRun(ctx context.Context, workspaceID, ownerID primitive.ObjectID, agentID string) (model.Agent, error) {
	if strings.TrimSpace(agentID) == "" {
		return s.ensureDefaultAgent(ctx, workspaceID, ownerID)
	}
	id, err := primitive.ObjectIDFromHex(strings.TrimSpace(agentID))
	if err != nil {
		return model.Agent{}, err
	}
	var agent model.Agent
	if err := s.store.Agents.FindOne(ctx, bson.M{"_id": id, "workspaceId": workspaceID}).Decode(&agent); err != nil {
		return model.Agent{}, err
	}
	if !agent.Enabled {
		return model.Agent{}, mongo.ErrNoDocuments
	}
	return agent, nil
}

type agentRequest struct {
	Name        *string              `json:"name"`
	Icon        *string              `json:"icon"`
	Description *string              `json:"description"`
	Mode        *string              `json:"mode"`
	Scopes      *[]string            `json:"scopes"`
	Enabled     *bool                `json:"enabled"`
	Schedule    *model.AgentSchedule `json:"schedule"`
}

func (s *Server) listAgents(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	if _, err := s.ensureDefaultAgent(r.Context(), wsID, currentUserID(r)); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load agents")
		return
	}
	cur, err := s.store.Agents.Find(r.Context(), bson.M{"workspaceId": wsID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load agents")
		return
	}
	defer cur.Close(r.Context())
	agents := make([]model.Agent, 0)
	if err := cur.All(r.Context(), &agents); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load agents")
		return
	}
	writeJSON(w, http.StatusOK, agents)
}

func (s *Server) createAgent(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	ws, role, err := s.accessibleWorkspace(r, wsID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	if !canEdit(role) {
		writeErr(w, http.StatusForbidden, "you do not have permission to manage agents")
		return
	}
	var req agentRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	agent := model.Agent{
		ID: primitive.NewObjectID(), WorkspaceID: ws.ID, OwnerID: currentUserID(r),
		Name: "Motion AI", Icon: "✨", Mode: "approval", Scopes: defaultAgentScopes(), Enabled: true,
		CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC(),
	}
	applyAgentPatch(&agent, req)
	if err := validateAgent(agent); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if _, err := s.store.Agents.InsertOne(r.Context(), agent); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create agent")
		return
	}
	s.writeAudit(r.Context(), ws.ID, currentUserID(r), s.currentUserName(r), agent.ID, agent.Name,
		"agent.created", "agent", agent.ID.Hex(), "Created agent "+agent.Name)
	writeJSON(w, http.StatusCreated, agent)
}

func (s *Server) updateAgent(w http.ResponseWriter, r *http.Request) {
	agentID, err := primitive.ObjectIDFromHex(chiURLParam(r, "agentID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid agent id")
		return
	}
	var agent model.Agent
	if err := s.store.Agents.FindOne(r.Context(), bson.M{"_id": agentID}).Decode(&agent); err != nil {
		writeErr(w, http.StatusNotFound, "agent not found")
		return
	}
	if _, role, err := s.accessibleWorkspace(r, agent.WorkspaceID); err != nil || !canEdit(role) {
		writeErr(w, http.StatusForbidden, "you do not have permission to manage agents")
		return
	}
	var req agentRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	applyAgentPatch(&agent, req)
	agent.UpdatedAt = time.Now().UTC()
	if err := validateAgent(agent); err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if _, err := s.store.Agents.UpdateByID(r.Context(), agent.ID, bson.M{"$set": agent}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update agent")
		return
	}
	s.writeAudit(r.Context(), agent.WorkspaceID, currentUserID(r), s.currentUserName(r), agent.ID, agent.Name,
		"agent.updated", "agent", agent.ID.Hex(), "Updated agent "+agent.Name)
	writeJSON(w, http.StatusOK, agent)
}

func (s *Server) deleteAgent(w http.ResponseWriter, r *http.Request) {
	agentID, err := primitive.ObjectIDFromHex(chiURLParam(r, "agentID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid agent id")
		return
	}
	var agent model.Agent
	if err := s.store.Agents.FindOne(r.Context(), bson.M{"_id": agentID}).Decode(&agent); err != nil {
		writeErr(w, http.StatusNotFound, "agent not found")
		return
	}
	if _, role, err := s.accessibleWorkspace(r, agent.WorkspaceID); err != nil || !canEdit(role) {
		writeErr(w, http.StatusForbidden, "you do not have permission to manage agents")
		return
	}
	if agent.IsDefault {
		writeErr(w, http.StatusBadRequest, "the default agent cannot be deleted")
		return
	}
	if _, err := s.store.Agents.DeleteOne(r.Context(), bson.M{"_id": agent.ID}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not delete agent")
		return
	}
	s.writeAudit(r.Context(), agent.WorkspaceID, currentUserID(r), s.currentUserName(r), agent.ID, agent.Name,
		"agent.deleted", "agent", agent.ID.Hex(), "Deleted agent "+agent.Name)
	w.WriteHeader(http.StatusNoContent)
}

func applyAgentPatch(agent *model.Agent, req agentRequest) {
	if req.Name != nil {
		agent.Name = strings.TrimSpace(*req.Name)
	}
	if req.Icon != nil {
		agent.Icon = strings.TrimSpace(*req.Icon)
	}
	if req.Description != nil {
		agent.Description = strings.TrimSpace(*req.Description)
	}
	if req.Mode != nil {
		agent.Mode = strings.ToLower(strings.TrimSpace(*req.Mode))
	}
	if req.Scopes != nil {
		agent.Scopes = normalizeScopes(*req.Scopes)
	}
	if req.Enabled != nil {
		agent.Enabled = *req.Enabled
	}
	if req.Schedule != nil {
		sched := *req.Schedule
		if sched.EveryHours < 0 {
			sched.EveryHours = 0
		}
		if sched.EveryHours > 24*30 {
			sched.EveryHours = 24 * 30
		}
		sched.Prompt = strings.TrimSpace(sched.Prompt)
		sched.PageID = strings.TrimSpace(sched.PageID)
		if sched.Prompt == "" || sched.EveryHours <= 0 {
			sched.Enabled = false
		}
		// Preserve server-maintained run state across edits.
		if agent.Schedule != nil {
			sched.NextRun = agent.Schedule.NextRun
			sched.LastRun = agent.Schedule.LastRun
			sched.LastRunError = agent.Schedule.LastRunError
		}
		if sched.Enabled && sched.NextRun == nil {
			next := time.Now().UTC().Add(time.Duration(sched.EveryHours) * time.Hour)
			sched.NextRun = &next
		}
		if !sched.Enabled {
			sched.NextRun = nil
		}
		agent.Schedule = &sched
	}
}

func validateAgent(agent model.Agent) error {
	if agent.Name == "" || len([]rune(agent.Name)) > 80 {
		return errString("agent name must be between 1 and 80 characters")
	}
	if agent.Mode != "auto" && agent.Mode != "approval" {
		return errString("agent mode must be auto or approval")
	}
	if len(agent.Scopes) == 0 {
		return errString("agent needs at least one scope")
	}
	for _, scope := range agent.Scopes {
		switch scope {
		case "pages:read", "pages:write", "workspace:read":
		default:
			return errString("unsupported agent scope: " + scope)
		}
	}
	return nil
}

type errString string

func (e errString) Error() string { return string(e) }

func normalizeScopes(scopes []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(scopes))
	for _, scope := range scopes {
		scope = strings.TrimSpace(scope)
		if scope == "" || seen[scope] {
			continue
		}
		seen[scope] = true
		out = append(out, scope)
	}
	return out
}

// POST /workspaces/{workspaceID}/agents/{agentID}/run — dispatch an agent task
// asynchronously. Approval-mode results land in the Agent Inbox (with a
// realtime push); auto-mode results apply directly like AI chat.
func (s *Server) runAgent(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	agentID, err := primitive.ObjectIDFromHex(chiURLParam(r, "agentID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid agent id")
		return
	}
	var agent model.Agent
	if err := s.store.Agents.FindOne(r.Context(), bson.M{"_id": agentID, "workspaceId": wsID}).Decode(&agent); err != nil {
		writeErr(w, http.StatusNotFound, "agent not found")
		return
	}
	if !agent.Enabled {
		writeErr(w, http.StatusBadRequest, "this agent is disabled")
		return
	}
	var req struct {
		Prompt string `json:"prompt"`
		PageID string `json:"pageId"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" || len([]rune(prompt)) > 12000 {
		writeErr(w, http.StatusBadRequest, "prompt must be between 1 and 12000 characters")
		return
	}
	pageHex := strings.TrimSpace(req.PageID)
	if pageHex != "" {
		pageID, err := primitive.ObjectIDFromHex(pageHex)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid page id")
			return
		}
		if _, _, err := s.accessiblePageFor(r.Context(), pageID, currentUserID(r)); err != nil {
			writeErr(w, http.StatusNotFound, "page not found")
			return
		}
	}
	setting, err := s.aiSetting(r)
	if err == mongo.ErrNoDocuments || (err == nil && !aiConfigured(setting)) {
		writeErr(w, http.StatusBadRequest, "configure your AI provider in Settings → AI first")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load AI settings")
		return
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
	run := model.AgentRun{
		ID: primitive.NewObjectID(), WorkspaceID: wsID,
		AgentID: agent.ID, AgentName: agent.Name,
		ActorID: user.ID, ActorName: user.Name,
		Prompt: prompt, PageID: pageHex,
		Status: "queued", CreatedAt: time.Now().UTC(),
	}
	if _, err := s.store.AgentRuns.InsertOne(r.Context(), run); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not queue task")
		return
	}
	s.writeAudit(r.Context(), wsID, user.ID, user.Name, agent.ID, agent.Name,
		"agent.run.queued", "agent", agent.ID.Hex(), "Queued task for "+agent.Name)
	go s.executeAgentRun(agent, user, setting, prompt, pageHex, run.ID, false)
	writeJSON(w, http.StatusAccepted, map[string]any{
		"runId": runID.Hex(), "agentId": agent.ID.Hex(), "status": "queued",
	})
}

func (s *Server) executeAgentRun(agent model.Agent, user model.User, setting model.AISetting, prompt, pageHex string, runID primitive.ObjectID, scheduled bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	fail := func(msg string) {
		now := time.Now().UTC()
		_, _ = s.store.AgentRuns.UpdateByID(ctx, runID, bson.M{"$set": bson.M{
			"status": "failed", "error": msg, "finishedAt": now,
		}})
		s.writeAudit(ctx, agent.WorkspaceID, user.ID, user.Name, agent.ID, agent.Name,
			"agent.run.failed", "agent", agent.ID.Hex(), "Task failed: "+msg)
		s.hub.BroadcastWorkspace(agent.WorkspaceID.Hex(), map[string]any{
			"type": "agent-run", "workspaceId": agent.WorkspaceID.Hex(),
			"action": "failed", "runId": runID.Hex(), "agentId": agent.ID.Hex(), "error": msg,
		}, "")
	}
	now := time.Now().UTC()
	_, _ = s.store.AgentRuns.UpdateByID(ctx, runID, bson.M{"$set": bson.M{
		"status": "running", "startedAt": now,
	}})
	key := ""
	if setting.KeyCipher != "" {
		var err error
		key, err = secret.Decrypt(s.cfg.EncryptionKey, setting.KeyCipher)
		if err != nil {
			fail("Could not read the saved API key")
			return
		}
	}
	modelName := setting.Model
	if modelName == "" {
		modelName = aiDefaultModel(setting.Provider, s.siteSnapshot().AIModel)
	}
	agentScopes := make(map[string]bool, len(agent.Scopes))
	for _, scope := range agent.Scopes {
		agentScopes[scope] = true
	}
	runner := &docagent.Runner{
		Store: s.store, Hub: s.hub, User: user, Key: key,
		ModelName: modelName, Provider: setting.Provider, BaseURL: setting.BaseURL,
		Scopes: agentScopes, TrackChanges: true,
	}
	reply, actions, err := runner.Run(ctx, nil, prompt, pageHex)
	if err != nil {
		fail(err.Error())
		return
	}
	s.recordAIUsage(ctx, user.ID, runner.LastUsage, prompt, reply)
	proposals := []model.AIProposal{}
	if agent.Mode == "approval" {
		proposals = s.finalizeApproval(ctx, agent, runner, user, prompt)
	} else {
		// Auto-apply keeps working, but leaves an approved record for audit.
		proposals = s.recordAutoProposals(ctx, agent, runner, user, prompt)
	}
	proposalIDs := make([]string, 0, len(proposals))
	for _, proposal := range proposals {
		proposalIDs = append(proposalIDs, proposal.ID.Hex())
	}
	finished := time.Now().UTC()
	_, _ = s.store.AgentRuns.UpdateByID(ctx, runID, bson.M{"$set": bson.M{
		"status": "succeeded", "finishedAt": finished,
		"proposalIds": proposalIDs, "actions": len(actions),
		"tokens": runner.LastUsage.TotalTokens,
	}})
	s.writeAudit(ctx, agent.WorkspaceID, user.ID, user.Name, agent.ID, agent.Name,
		"agent.run", "agent", agent.ID.Hex(),
		fmt.Sprintf("Ran %s (%d actions, %d proposals)", agent.Name, len(actions), len(proposals)))
	s.hub.BroadcastWorkspace(agent.WorkspaceID.Hex(), map[string]any{
		"type": "agent-run", "workspaceId": agent.WorkspaceID.Hex(),
		"action": "finished", "runId": runID.Hex(), "agentId": agent.ID.Hex(),
		"proposalCount": len(proposals),
	}, "")
	_ = scheduled
}

// recordAutoProposals persists approved records for auto-apply runs so the
// Inbox keeps an audit trail. Page state is NOT restored.
func (s *Server) recordAutoProposals(ctx context.Context, agent model.Agent, runner *docagent.Runner, actor model.User, prompt string) []model.AIProposal {
	created := make([]model.AIProposal, 0)
	now := time.Now().UTC()
	for _, touched := range runner.Touched {
		after := touched.After
		if !touched.Created && pagesEqual(touched.Before, after) {
			continue
		}
		proposal := model.AIProposal{
			ID: primitive.NewObjectID(), WorkspaceID: after.WorkspaceID, PageID: after.ID,
			AgentID: agent.ID, AgentName: agent.Name, ActorID: actor.ID, ActorName: actor.Name,
			PageTitle: after.Title, Prompt: prompt, Before: touched.Before, After: after, Created: touched.Created,
			Status: "approved", CreatedAt: now, ReviewedAt: &now, ReviewedBy: &actor.ID,
		}
		if touched.Created {
			proposal.Before = nil
		}
		if _, err := s.store.Proposals.InsertOne(ctx, proposal); err != nil {
			continue
		}
		created = append(created, proposal)
		s.writeAudit(ctx, proposal.WorkspaceID, actor.ID, actor.Name, agent.ID, agent.Name,
			"proposal.approved", "proposal", proposal.ID.Hex(), "Auto-applied changes to \u201c"+proposal.PageTitle+"\u201d")
	}
	if len(created) > 0 {
		s.hub.BroadcastWorkspace(agent.WorkspaceID.Hex(), map[string]any{
			"type": "proposals", "workspaceId": agent.WorkspaceID.Hex(), "action": "created",
		}, "")
	}
	return created
}

// GET /workspaces/{workspaceID}/agent-runs?limit=
func (s *Server) listAgentRuns(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	limit := int64(50)
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		var parsed int64
		if _, err := fmt.Sscanf(raw, "%d", &parsed); err == nil && parsed > 0 && parsed <= 200 {
			limit = parsed
		}
	}
	cur, err := s.store.AgentRuns.Find(r.Context(), bson.M{"workspaceId": wsID},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(limit))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load runs")
		return
	}
	defer cur.Close(r.Context())
	runs := make([]model.AgentRun, 0)
	if err := cur.All(r.Context(), &runs); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load runs")
		return
	}
	writeJSON(w, http.StatusOK, runs)
}

// StartAgentScheduler periodically runs agents with an enabled schedule.
func (s *Server) StartAgentScheduler(ctx context.Context) {
	go func() {
		timer := time.NewTimer(30 * time.Second)
		defer timer.Stop()
		ticker := time.NewTicker(1 * time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				s.runDueAgentSchedules(ctx)
				timer.Reset(1 * time.Minute)
			case <-ticker.C:
				s.runDueAgentSchedules(ctx)
			}
		}
	}()
}

func (s *Server) runDueAgentSchedules(ctx context.Context) {
	now := time.Now().UTC()
	opCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	cur, err := s.store.Agents.Find(opCtx, bson.M{
		"enabled": true, "schedule.enabled": true,
		"schedule.nextRun": bson.M{"$lte": now},
	}, options.Find().SetLimit(20))
	if err != nil {
		return
	}
	defer cur.Close(opCtx)
	var due []model.Agent
	if err := cur.All(opCtx, &due); err != nil {
		return
	}
	for _, agent := range due {
		agent := agent
		if agent.Schedule == nil || !agent.Schedule.Enabled || agent.Schedule.EveryHours <= 0 ||
			strings.TrimSpace(agent.Schedule.Prompt) == "" {
			continue
		}
		// Claim the slot first so overlapping ticks cannot double-run.
		next := now.Add(time.Duration(agent.Schedule.EveryHours) * time.Hour)
		lastRun := now
		_, _ = s.store.Agents.UpdateByID(opCtx, agent.ID, bson.M{"$set": bson.M{
			"schedule.nextRun": next, "schedule.lastRun": lastRun,
		}})
		go s.executeScheduledRun(agent)
	}
}

func (s *Server) executeScheduledRun(agent model.Agent) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	fail := func(msg string) {
		_, _ = s.store.Agents.UpdateByID(ctx, agent.ID, bson.M{"$set": bson.M{"schedule.lastRunError": msg}})
		s.writeAudit(ctx, agent.WorkspaceID, agent.OwnerID, "Scheduler", agent.ID, agent.Name,
			"agent.run.failed", "agent", agent.ID.Hex(), "Scheduled run failed: "+msg)
	}
	var owner model.User
	if err := s.store.Users.FindOne(ctx, bson.M{"_id": agent.OwnerID}).Decode(&owner); err != nil {
		fail("owner account no longer exists")
		return
	}
	var setting model.AISetting
	if err := s.store.AISettings.FindOne(ctx, bson.M{"userId": agent.OwnerID}).Decode(&setting); err != nil {
		fail("AI provider is not configured")
		return
	}
	if !aiConfigured(setting) {
		fail("AI provider is not configured")
		return
	}
	if s.aiBudgetExceeded(ctx, owner.ID) {
		fail("daily AI token budget exceeded")
		return
	}
	prompt := strings.TrimSpace(agent.Schedule.Prompt)
	pageHex := strings.TrimSpace(agent.Schedule.PageID)
	if pageHex != "" {
		if pageID, err := primitive.ObjectIDFromHex(pageHex); err != nil {
			fail("scheduled page id is invalid")
			return
		} else if _, _, err := s.accessiblePageFor(ctx, pageID, owner.ID); err != nil {
			fail("scheduled page is no longer accessible")
			return
		}
	}
	_, _ = s.store.Agents.UpdateByID(ctx, agent.ID, bson.M{"$set": bson.M{"schedule.lastRunError": ""}})
	run := model.AgentRun{
		ID: primitive.NewObjectID(), WorkspaceID: agent.WorkspaceID,
		AgentID: agent.ID, AgentName: agent.Name,
		ActorID: owner.ID, ActorName: owner.Name,
		Prompt: prompt, PageID: pageHex, Scheduled: true,
		Status: "queued", CreatedAt: time.Now().UTC(),
	}
	if _, err := s.store.AgentRuns.InsertOne(ctx, run); err != nil {
		return
	}
	s.executeAgentRun(agent, owner, setting, prompt, pageHex, run.ID, true)
}

func (s *Server) currentUserName(r *http.Request) string {
	_, name := s.editorFor(r)
	return name
}

func (s *Server) writeAudit(ctx context.Context, workspaceID, actorID primitive.ObjectID, actorName string, agentID primitive.ObjectID, agentName, action, targetType, targetID, summary string) {
	if actorName == "" {
		actorName = "Someone"
	}
	_, _ = s.store.Audit.InsertOne(ctx, model.AuditLog{
		ID: primitive.NewObjectID(), WorkspaceID: workspaceID, ActorID: actorID, ActorName: actorName,
		AgentID: agentID, AgentName: agentName, Action: action, TargetType: targetType, TargetID: targetID,
		Summary: summary, CreatedAt: time.Now().UTC(),
	})
}

func (s *Server) listProposals(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	filter := bson.M{"workspaceId": wsID}
	if status := strings.TrimSpace(r.URL.Query().Get("status")); status != "" {
		filter["status"] = status
	}
	cur, err := s.store.Proposals.Find(r.Context(), filter, options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(100))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load proposals")
		return
	}
	defer cur.Close(r.Context())
	proposals := make([]model.AIProposal, 0)
	if err := cur.All(r.Context(), &proposals); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load proposals")
		return
	}
	writeJSON(w, http.StatusOK, proposals)
}

func (s *Server) getProposal(w http.ResponseWriter, r *http.Request) {
	proposal, ok := s.accessibleProposal(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, proposal)
}

func (s *Server) accessibleProposal(w http.ResponseWriter, r *http.Request) (model.AIProposal, bool) {
	id, err := primitive.ObjectIDFromHex(chiURLParam(r, "proposalID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid proposal id")
		return model.AIProposal{}, false
	}
	var proposal model.AIProposal
	if err := s.store.Proposals.FindOne(r.Context(), bson.M{"_id": id}).Decode(&proposal); err != nil {
		writeErr(w, http.StatusNotFound, "proposal not found")
		return model.AIProposal{}, false
	}
	if _, _, err := s.accessibleWorkspace(r, proposal.WorkspaceID); err != nil {
		writeErr(w, http.StatusNotFound, "proposal not found")
		return model.AIProposal{}, false
	}
	return proposal, true
}

func (s *Server) approveProposal(w http.ResponseWriter, r *http.Request) {
	proposal, ok := s.accessibleProposal(w, r)
	if !ok {
		return
	}
	_, role, _ := s.accessibleWorkspace(r, proposal.WorkspaceID)
	if !canEdit(role) {
		writeErr(w, http.StatusForbidden, "you do not have permission to approve changes")
		return
	}
	if proposal.Status != "pending" {
		writeErr(w, http.StatusBadRequest, "this proposal was already reviewed")
		return
	}
	after := proposal.After
	after.WorkspaceID = proposal.WorkspaceID
	after.Text = textFromBlocks(after.Blocks)
	now := time.Now().UTC()
	after.UpdatedAt = now
	if proposal.Created {
		if after.BlocksRev < 1 {
			after.BlocksRev = 1
		}
		if _, err := s.store.Pages.ReplaceOne(r.Context(), bson.M{"_id": after.ID}, after, options.Replace().SetUpsert(true)); err != nil {
			writeErr(w, http.StatusInternalServerError, "could not apply proposal")
			return
		}
	} else {
		var current model.Page
		if err := s.store.Pages.FindOne(r.Context(), bson.M{"_id": after.ID}).Decode(&current); err != nil {
			writeErr(w, http.StatusNotFound, "page no longer exists")
			return
		}
		after.BlocksRev = current.BlocksRev + 1
		if _, err := s.store.Pages.UpdateByID(r.Context(), after.ID, bson.M{"$set": bson.M{
			"title": after.Title, "icon": after.Icon, "cover": after.Cover,
			"blocks": after.Blocks, "blocksRev": after.BlocksRev,
			"text": after.Text, "updatedAt": now,
		}}); err != nil {
			writeErr(w, http.StatusInternalServerError, "could not apply proposal")
			return
		}
	}
	s.broadcastProposalPage(after, now)
	status := "approved"
	if _, err := s.store.Proposals.UpdateByID(r.Context(), proposal.ID, bson.M{"$set": bson.M{
		"status": status, "reviewedAt": now, "reviewedBy": currentUserID(r),
	}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update proposal")
		return
	}
	proposal.Status = status
	s.writeAudit(r.Context(), proposal.WorkspaceID, currentUserID(r), s.currentUserName(r), proposal.AgentID, proposal.AgentName,
		"proposal.approved", "proposal", proposal.ID.Hex(), "Approved changes to “"+proposal.PageTitle+"”")
	s.hub.BroadcastWorkspace(proposal.WorkspaceID.Hex(), map[string]any{
		"type": "proposals", "workspaceId": proposal.WorkspaceID.Hex(), "action": "approved",
	}, "")
	s.webhooks.Emit(r.Context(), proposal.WorkspaceID, "proposal.approved", map[string]any{
		"proposalId": proposal.ID.Hex(), "pageId": proposal.PageID.Hex(),
		"pageTitle": proposal.PageTitle, "agent": proposal.AgentName,
	})
	writeJSON(w, http.StatusOK, proposal)
}

func (s *Server) rejectProposal(w http.ResponseWriter, r *http.Request) {
	proposal, ok := s.accessibleProposal(w, r)
	if !ok {
		return
	}
	_, role, _ := s.accessibleWorkspace(r, proposal.WorkspaceID)
	if !canEdit(role) {
		writeErr(w, http.StatusForbidden, "you do not have permission to reject changes")
		return
	}
	if proposal.Status != "pending" {
		writeErr(w, http.StatusBadRequest, "this proposal was already reviewed")
		return
	}
	var reasonReq struct {
		Reason string `json:"reason"`
	}
	_ = decodeJSON(r, &reasonReq)
	reason := strings.TrimSpace(reasonReq.Reason)
	if len([]rune(reason)) > 2000 {
		reason = string([]rune(reason)[:2000])
	}
	now := time.Now().UTC()
	if _, err := s.store.Proposals.UpdateByID(r.Context(), proposal.ID, bson.M{"$set": bson.M{
		"status": "rejected", "reviewedAt": now, "reviewedBy": currentUserID(r),
		"rejectReason": reason,
	}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update proposal")
		return
	}
	proposal.Status = "rejected"
	proposal.RejectReason = reason
	summary := "Rejected changes to “" + proposal.PageTitle + "”"
	if reason != "" {
		summary += ": " + reason
	}
	s.writeAudit(r.Context(), proposal.WorkspaceID, currentUserID(r), s.currentUserName(r), proposal.AgentID, proposal.AgentName,
		"proposal.rejected", "proposal", proposal.ID.Hex(), summary)
	s.hub.BroadcastWorkspace(proposal.WorkspaceID.Hex(), map[string]any{
		"type": "proposals", "workspaceId": proposal.WorkspaceID.Hex(), "action": "rejected",
	}, "")
	writeJSON(w, http.StatusOK, proposal)
}

func (s *Server) listAudit(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	page, pageSize := paginationParams(r)
	filter := bson.M{"workspaceId": wsID}
	if actor := strings.TrimSpace(r.URL.Query().Get("actor")); actor != "" {
		if actorID, err := primitive.ObjectIDFromHex(actor); err == nil {
			filter["actorId"] = actorID
		}
	}
	if action := strings.TrimSpace(r.URL.Query().Get("action")); action != "" {
		filter["action"] = action
	}
	if target := strings.TrimSpace(r.URL.Query().Get("target")); target != "" {
		filter["targetId"] = target
	}
	if from := strings.TrimSpace(r.URL.Query().Get("from")); from != "" {
		if parsed, err := time.Parse(time.RFC3339, from); err == nil {
			filter["createdAt"] = bson.M{"$gte": parsed}
		}
	}
	if to := strings.TrimSpace(r.URL.Query().Get("to")); to != "" {
		if parsed, err := time.Parse(time.RFC3339, to); err == nil {
			if existing, ok := filter["createdAt"].(bson.M); ok {
				existing["$lte"] = parsed
			} else {
				filter["createdAt"] = bson.M{"$lte": parsed}
			}
		}
	}
	total, err := s.store.Audit.CountDocuments(r.Context(), filter)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load activity")
		return
	}
	cur, err := s.store.Audit.Find(r.Context(), filter, options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).
		SetSkip((page-1)*pageSize).
		SetLimit(pageSize))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load activity")
		return
	}
	defer cur.Close(r.Context())
	logs := make([]model.AuditLog, 0)
	if err := cur.All(r.Context(), &logs); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load activity")
		return
	}
	writeJSON(w, http.StatusOK, paginate(logs, page, pageSize, total))
}

func pagesEqual(a *model.Page, b model.Page) bool {
	if a == nil {
		return false
	}
	if a.Title != b.Title || a.Icon != b.Icon || a.Cover != b.Cover || len(a.Blocks) != len(b.Blocks) {
		return false
	}
	for i := range a.Blocks {
		if !blocksEqual(a.Blocks[i], b.Blocks[i]) {
			return false
		}
	}
	return true
}

func blocksEqual(a, b model.Block) bool {
	// Compare the persisted content, not only the id.
	return a.ID == b.ID && a.Type == b.Type && a.Text == b.Text && a.Rich == b.Rich &&
		a.Checked == b.Checked && a.Language == b.Language && a.Color == b.Color &&
		a.TextColor == b.TextColor && a.BGColor == b.BGColor && a.Align == b.Align && a.Width == b.Width && a.LineNumbers == b.LineNumbers &&
		a.URL == b.URL && a.Caption == b.Caption && a.Ciphertext == b.Ciphertext &&
		a.Salt == b.Salt && a.IV == b.IV && tableEqual(a.Table, b.Table) && formEqual(a.Form, b.Form) && mapEqual(a.Map, b.Map) &&
		a.Indent == b.Indent && a.Collapsed == b.Collapsed && a.Locked == b.Locked
}

func mapEqual(a, b *model.MapData) bool {
	if a == nil || b == nil {
		return a == b
	}
	return a.Lat == b.Lat && a.Lng == b.Lng && a.Zoom == b.Zoom && a.Label == b.Label && a.Provider == b.Provider
}

func tableEqual(a, b *model.TableData) bool {
	if a == nil || b == nil {
		return a == b
	}
	if len(a.Columns) != len(b.Columns) || len(a.Rows) != len(b.Rows) || a.Header != b.Header {
		return false
	}
	for i := range a.Columns {
		if a.Columns[i] != b.Columns[i] {
			return false
		}
	}
	for i := range a.Rows {
		if len(a.Rows[i]) != len(b.Rows[i]) {
			return false
		}
		for j := range a.Rows[i] {
			if a.Rows[i][j] != b.Rows[i][j] {
				return false
			}
		}
	}
	return true
}

func (s *Server) finalizeApproval(ctx context.Context, agent model.Agent, runner *docagent.Runner, actor model.User, prompt string) []model.AIProposal {
	created := make([]model.AIProposal, 0)
	now := time.Now().UTC()
	for _, touched := range runner.Touched {
		after := touched.After
		if !touched.Created && pagesEqual(touched.Before, after) {
			continue
		}
		proposal := model.AIProposal{
			ID: primitive.NewObjectID(), WorkspaceID: after.WorkspaceID, PageID: after.ID,
			AgentID: agent.ID, AgentName: agent.Name, ActorID: actor.ID, ActorName: actor.Name,
			PageTitle: after.Title, Prompt: prompt, Before: touched.Before, After: after, Created: touched.Created,
			Status: "pending", CreatedAt: now,
		}
		if touched.Created {
			proposal.Before = nil
		}
		if _, err := s.store.Proposals.InsertOne(ctx, proposal); err != nil {
			continue
		}
		created = append(created, proposal)
		// Restore the pre-run state. The proposal owns the pending after-state.
		if touched.Created {
			_, _ = s.store.Pages.DeleteOne(ctx, bson.M{"_id": after.ID})
			s.hub.BroadcastWorkspace(after.WorkspaceID.Hex(), map[string]any{
				"type": "tree", "workspaceId": after.WorkspaceID.Hex(),
			}, "")
		} else if touched.Before != nil {
			before := *touched.Before
			before.BlocksRev = before.BlocksRev + 1
			_, _ = s.store.Pages.UpdateByID(ctx, after.ID, bson.M{"$set": bson.M{
				"title": before.Title, "icon": before.Icon, "cover": before.Cover,
				"blocks": before.Blocks, "blocksRev": before.BlocksRev,
				"text": textFromBlocks(before.Blocks), "updatedAt": now,
			}})
			s.broadcastProposalPage(before, now)
		}
		s.writeAudit(ctx, proposal.WorkspaceID, actor.ID, actor.Name, agent.ID, agent.Name,
			"proposal.created", "proposal", proposal.ID.Hex(), "Prepared changes to “"+proposal.PageTitle+"”")
		s.webhooks.Emit(ctx, proposal.WorkspaceID, "proposal.created", map[string]any{
			"proposalId": proposal.ID.Hex(), "pageId": proposal.PageID.Hex(),
			"pageTitle": proposal.PageTitle, "agent": proposal.AgentName,
		})
	}
	if len(created) > 0 {
		s.hub.BroadcastWorkspace(agent.WorkspaceID.Hex(), map[string]any{
			"type": "proposals", "workspaceId": agent.WorkspaceID.Hex(), "action": "created",
		}, "")
	}
	return created
}

func (s *Server) broadcastProposalPage(page model.Page, now time.Time) {
	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "blocks", "pageId": page.ID.Hex(), "blocks": page.Blocks,
		"blocksRev": page.BlocksRev, "updatedAt": now,
		"editor": map[string]string{"userId": "system", "name": "Motion AI", "color": realtime.ColorFor("motion-ai")},
	}, "")
	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "meta", "pageId": page.ID.Hex(),
		"page":   map[string]any{"title": page.Title, "icon": page.Icon, "cover": page.Cover},
		"editor": map[string]string{"userId": "system", "name": "Motion AI", "color": realtime.ColorFor("motion-ai")},
	}, "")
	s.hub.BroadcastWorkspace(page.WorkspaceID.Hex(), map[string]any{
		"type": "tree", "workspaceId": page.WorkspaceID.Hex(),
	}, "")
}

func formEqual(a, b *model.FormData) bool {
	return string(mustJSON(a)) == string(mustJSON(b))
}
func mustJSON(value any) []byte { data, _ := json.Marshal(value); return data }
