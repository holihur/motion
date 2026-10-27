package httpapi

import (
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/model"
)

var publishTargets = map[string]bool{
	"ssh": true, "git": true, "jira": true, "confluence": true, "storage": true,
}

type publishGroupRequest struct {
	Name    string   `json:"name"`
	Targets []string `json:"targets"`
}

func (s *Server) listPublishGroups(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	cur, err := s.store.PublishGroups.Find(r.Context(), bson.M{"workspaceId": wsID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load publish groups")
		return
	}
	defer cur.Close(r.Context())
	groups := make([]model.PublishGroup, 0)
	if err := cur.All(r.Context(), &groups); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load publish groups")
		return
	}
	writeJSON(w, http.StatusOK, groups)
}

func (s *Server) savePublishGroup(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	var req publishGroupRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Name) > 80 || len(req.Targets) == 0 {
		writeErr(w, http.StatusBadRequest, "a group needs a name and at least one target")
		return
	}
	seen := map[string]bool{}
	targets := make([]string, 0, len(req.Targets))
	for _, target := range req.Targets {
		if !publishTargets[target] || seen[target] {
			continue
		}
		seen[target] = true
		targets = append(targets, target)
	}
	if len(targets) == 0 {
		writeErr(w, http.StatusBadRequest, "choose at least one valid target")
		return
	}
	now := time.Now().UTC()
	id, _ := primitive.ObjectIDFromHex(chiURLParam(r, "groupID"))
	group := model.PublishGroup{ID: id, WorkspaceID: wsID, Name: req.Name, Targets: targets, UpdatedAt: now}
	if id.IsZero() {
		group.ID = primitive.NewObjectID()
		group.CreatedAt = now
		if _, err := s.store.PublishGroups.InsertOne(r.Context(), group); err != nil {
			writeErr(w, http.StatusInternalServerError, "could not save publish group")
			return
		}
		writeJSON(w, http.StatusCreated, group)
		return
	}
	if _, err := s.store.PublishGroups.UpdateOne(r.Context(), bson.M{"_id": id, "workspaceId": wsID}, bson.M{"$set": bson.M{
		"name": req.Name, "targets": targets, "updatedAt": now,
	}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save publish group")
		return
	}
	group.CreatedAt = now
	writeJSON(w, http.StatusOK, group)
}

func (s *Server) deletePublishGroup(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	id, err := primitive.ObjectIDFromHex(chiURLParam(r, "groupID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid group id")
		return
	}
	_, _ = s.store.PublishGroups.DeleteOne(r.Context(), bson.M{"_id": id, "workspaceId": wsID})
	w.WriteHeader(http.StatusNoContent)
}
