package httpapi

import (
	"context"
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
	Name        *string   `json:"name"`
	Icon        *string   `json:"icon"`
	Description *string   `json:"description"`
	Mode        *string   `json:"mode"`
	Scopes      *[]string `json:"scopes"`
	Enabled     *bool     `json:"enabled"`
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
	now := time.Now().UTC()
	if _, err := s.store.Proposals.UpdateByID(r.Context(), proposal.ID, bson.M{"$set": bson.M{
		"status": "rejected", "reviewedAt": now, "reviewedBy": currentUserID(r),
	}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update proposal")
		return
	}
	proposal.Status = "rejected"
	s.writeAudit(r.Context(), proposal.WorkspaceID, currentUserID(r), s.currentUserName(r), proposal.AgentID, proposal.AgentName,
		"proposal.rejected", "proposal", proposal.ID.Hex(), "Rejected changes to “"+proposal.PageTitle+"”")
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
	cur, err := s.store.Audit.Find(r.Context(), bson.M{"workspaceId": wsID}, options.Find().
		SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(100))
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
	writeJSON(w, http.StatusOK, logs)
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
		a.URL == b.URL && a.Caption == b.Caption && a.Ciphertext == b.Ciphertext &&
		a.Salt == b.Salt && a.IV == b.IV && tableEqual(a.Table, b.Table)
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

func (s *Server) finalizeApproval(ctx context.Context, agent model.Agent, runner *docagent.Runner, actor model.User) []model.AIProposal {
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
			PageTitle: after.Title, Before: touched.Before, After: after, Created: touched.Created,
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
