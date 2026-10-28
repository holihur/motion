package httpapi

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/model"
)

func (s *Server) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	cur, err := s.store.Workspaces.Find(r.Context(),
		bson.M{"$or": []bson.M{
			{"ownerId": currentUserID(r)},
			{"members.userId": currentUserID(r)},
		}},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}),
	)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load workspaces")
		return
	}
	defer cur.Close(r.Context())

	workspaces := make([]model.Workspace, 0)
	if err := cur.All(r.Context(), &workspaces); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load workspaces")
		return
	}
	for i := range workspaces {
		redactWorkspaceMCP(&workspaces[i], currentUserID(r))
	}
	writeJSON(w, http.StatusOK, workspaces)
}

type workspaceRequest struct {
	Name *string `json:"name,omitempty"`
	Icon *string `json:"icon,omitempty"`
}

func (s *Server) createWorkspace(w http.ResponseWriter, r *http.Request) {
	var req workspaceRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	name := "Untitled Workspace"
	if req.Name != nil {
		name = strings.TrimSpace(*req.Name)
	}
	if name == "" || len(name) > 80 {
		writeErr(w, http.StatusBadRequest, "workspace name must be between 1 and 80 characters")
		return
	}
	icon := "🧭"
	if req.Icon != nil && strings.TrimSpace(*req.Icon) != "" {
		icon = strings.TrimSpace(*req.Icon)
	}

	now := time.Now().UTC()
	ws := model.Workspace{
		ID:        primitive.NewObjectID(),
		Name:      name,
		Icon:      icon,
		OwnerID:   currentUserID(r),
		CreatedAt: now,
		UpdatedAt: now,
	}
	if _, err := s.store.Workspaces.InsertOne(r.Context(), ws); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create workspace")
		return
	}
	writeJSON(w, http.StatusCreated, ws)
}

func (s *Server) updateWorkspace(w http.ResponseWriter, r *http.Request) {
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
	if role != roleOwner {
		writeErr(w, http.StatusForbidden, "only the workspace owner can update it")
		return
	}

	var req workspaceRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	updates := bson.M{}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" || len(name) > 80 {
			writeErr(w, http.StatusBadRequest, "workspace name must be between 1 and 80 characters")
			return
		}
		updates["name"] = name
	}
	if req.Icon != nil {
		updates["icon"] = strings.TrimSpace(*req.Icon)
	}
	if len(updates) == 0 {
		writeJSON(w, http.StatusOK, ws)
		return
	}
	updates["updatedAt"] = time.Now().UTC()
	if _, err := s.store.Workspaces.UpdateByID(r.Context(), wsID, bson.M{"$set": updates}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update workspace")
		return
	}
	if err := s.store.Workspaces.FindOne(r.Context(), bson.M{"_id": wsID}).Decode(&ws); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load workspace")
		return
	}
	writeJSON(w, http.StatusOK, ws)
}

func redactWorkspaceMCP(ws *model.Workspace, userID primitive.ObjectID) {
	if ws.OwnerID == userID {
		return
	}
	for i := range ws.MCPServers {
		ws.MCPServers[i].Headers = nil
	}
}

func (s *Server) deleteWorkspace(w http.ResponseWriter, r *http.Request) {
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
		writeErr(w, http.StatusForbidden, "only the workspace owner can delete it")
		return
	}
	if _, err := s.store.Pages.DeleteMany(r.Context(), bson.M{"workspaceId": wsID}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not delete pages")
		return
	}
	workspaceFilter := bson.M{"workspaceId": wsID}
	_, _ = s.store.Revisions.DeleteMany(r.Context(), workspaceFilter)
	_, _ = s.store.Comments.DeleteMany(r.Context(), workspaceFilter)
	_, _ = s.store.FormSubmissions.DeleteMany(r.Context(), workspaceFilter)
	_, _ = s.store.Agents.DeleteMany(r.Context(), workspaceFilter)
	_, _ = s.store.Proposals.DeleteMany(r.Context(), workspaceFilter)
	_, _ = s.store.Audit.DeleteMany(r.Context(), workspaceFilter)
	_, _ = s.store.Integrations.DeleteMany(r.Context(), workspaceFilter)
	_, _ = s.store.Deliveries.DeleteMany(r.Context(), workspaceFilter)
	_, _ = s.store.PublishGroups.DeleteMany(r.Context(), workspaceFilter)
	if _, err := s.store.Workspaces.DeleteOne(r.Context(), bson.M{"_id": wsID}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not delete workspace")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) listPages(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}

	cur, err := s.store.Pages.Find(r.Context(),
		bson.M{"workspaceId": wsID, "archived": false},
		options.Find().
			SetProjection(bson.M{"blocks": 0, "text": 0}).
			SetSort(bson.D{{Key: "order", Value: 1}, {Key: "createdAt", Value: 1}}),
	)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load pages")
		return
	}
	defer cur.Close(r.Context())

	pages := make([]model.PageSummary, 0)
	if err := cur.All(r.Context(), &pages); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load pages")
		return
	}
	writeJSON(w, http.StatusOK, pages)
}

func (s *Server) listTrash(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}

	cur, err := s.store.Pages.Find(r.Context(),
		bson.M{"workspaceId": wsID, "archived": true},
		options.Find().
			SetProjection(bson.M{"blocks": 0, "text": 0}).
			SetSort(bson.D{{Key: "archivedAt", Value: -1}}),
	)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load trash")
		return
	}
	defer cur.Close(r.Context())

	pages := make([]model.PageSummary, 0)
	if err := cur.All(r.Context(), &pages); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load trash")
		return
	}
	writeJSON(w, http.StatusOK, pages)
}

// chiURLParam is a tiny wrapper so handlers read cleanly without importing chi everywhere.
func chiURLParam(r *http.Request, key string) string {
	return chi.URLParam(r, key)
}

type workspaceAgentConfigRequest struct {
	Skills     []model.WorkspaceSkill `json:"skills"`
	MCPServers []model.WorkspaceMCP   `json:"mcpServers"`
}

func (s *Server) getWorkspaceAgentConfig(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	ws, _, err := s.accessibleWorkspace(r, wsID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	redactWorkspaceMCP(&ws, currentUserID(r))
	writeJSON(w, http.StatusOK, map[string]any{
		"skills": ws.Skills, "mcpServers": ws.MCPServers,
	})
}

func (s *Server) saveWorkspaceAgentConfig(w http.ResponseWriter, r *http.Request) {
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
	if role != roleOwner {
		writeErr(w, http.StatusForbidden, "only the workspace owner can configure agent skills and MCP")
		return
	}
	var req workspaceAgentConfigRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Skills) > 20 || len(req.MCPServers) > 10 {
		writeErr(w, http.StatusBadRequest, "too many skills or MCP servers")
		return
	}
	seenSkills := map[string]bool{}
	for i := range req.Skills {
		item := &req.Skills[i]
		item.Name = strings.TrimSpace(item.Name)
		item.Description = strings.TrimSpace(item.Description)
		item.Instructions = strings.TrimSpace(item.Instructions)
		if item.Name == "" || item.Instructions == "" {
			writeErr(w, http.StatusBadRequest, "every skill needs a name and instructions")
			return
		}
		if seenSkills[item.Name] {
			writeErr(w, http.StatusBadRequest, "skill names must be unique")
			return
		}
		seenSkills[item.Name] = true
		if item.ID == "" {
			item.ID = primitive.NewObjectID().Hex()
		}
		if len(item.Name) > 80 || len(item.Description) > 300 || len(item.Instructions) > 20000 {
			writeErr(w, http.StatusBadRequest, "a skill is too large")
			return
		}
	}
	seenMCP := map[string]bool{}
	for i := range req.MCPServers {
		item := &req.MCPServers[i]
		item.Name = strings.TrimSpace(item.Name)
		item.URL = strings.TrimSpace(item.URL)
		if item.Name == "" || item.URL == "" {
			writeErr(w, http.StatusBadRequest, "every MCP server needs a name and URL")
			return
		}
		if seenMCP[item.Name] {
			writeErr(w, http.StatusBadRequest, "MCP server names must be unique")
			return
		}
		seenMCP[item.Name] = true
		if item.ID == "" {
			item.ID = primitive.NewObjectID().Hex()
		}
		parsed, err := url.Parse(item.URL)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" {
			writeErr(w, http.StatusBadRequest, "MCP URL must be an http(s) URL")
			return
		}
		if item.Headers == nil {
			item.Headers = map[string]string{}
		}
		if len(item.Headers) > 20 {
			writeErr(w, http.StatusBadRequest, "too many MCP headers")
			return
		}
		for key, value := range item.Headers {
			if len(key) > 100 || len(value) > 2000 {
				writeErr(w, http.StatusBadRequest, "an MCP header is too large")
				return
			}
		}
	}
	if _, err := s.store.Workspaces.UpdateByID(r.Context(), ws.ID, bson.M{"$set": bson.M{
		"skills": req.Skills, "mcpServers": req.MCPServers, "updatedAt": time.Now().UTC(),
	}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save agent configuration")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"skills": req.Skills, "mcpServers": req.MCPServers})
}
