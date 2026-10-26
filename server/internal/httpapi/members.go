package httpapi

import (
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/model"
)

type memberView struct {
	UserID   primitive.ObjectID `json:"userId"`
	Name     string             `json:"name"`
	Email    string             `json:"email"`
	Role     string             `json:"role"`
	JoinedAt time.Time          `json:"joinedAt"`
	IsOwner  bool               `json:"isOwner"`
}

func (s *Server) memberViews(r *http.Request) ([]memberView, error) {
	ws, _, err := s.accessibleWorkspace(r, objectIDFromParam(r, "workspaceID"))
	if err != nil {
		return nil, err
	}
	views := make([]memberView, 0, len(ws.Members)+1)
	var owner model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": ws.OwnerID}).Decode(&owner); err == nil {
		views = append(views, memberView{
			UserID: owner.ID, Name: owner.Name, Email: owner.Email,
			Role: roleOwner, JoinedAt: ws.CreatedAt, IsOwner: true,
		})
	}
	for _, member := range ws.Members {
		view := memberView{
			UserID: member.UserID, Name: member.Name, Email: member.Email,
			Role: member.Role, JoinedAt: member.JoinedAt,
		}
		var user model.User
		if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": member.UserID}).Decode(&user); err == nil {
			view.Name, view.Email = user.Name, user.Email
		}
		views = append(views, view)
	}
	return views, nil
}

func (s *Server) listMembers(w http.ResponseWriter, r *http.Request) {
	views, err := s.memberViews(r)
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	writeJSON(w, http.StatusOK, views)
}

type inviteRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

func (s *Server) inviteMember(w http.ResponseWriter, r *http.Request) {
	wsID := objectIDFromParam(r, "workspaceID")
	ws, role, err := s.accessibleWorkspace(r, wsID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	if role != roleOwner {
		writeErr(w, http.StatusForbidden, "only the workspace owner can invite people")
		return
	}

	var req inviteRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		writeErr(w, http.StatusBadRequest, "email is required")
		return
	}
	if req.Role == "" {
		req.Role = roleEditor
	}
	if req.Role != roleEditor && req.Role != roleViewer {
		writeErr(w, http.StatusBadRequest, "role must be editor or viewer")
		return
	}

	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"email": email}).Decode(&user); err != nil {
		if err == mongo.ErrNoDocuments {
			writeErr(w, http.StatusNotFound, "no Motion account uses that email yet")
			return
		}
		writeErr(w, http.StatusInternalServerError, "could not look up that account")
		return
	}
	if user.ID == ws.OwnerID {
		writeErr(w, http.StatusBadRequest, "the owner already has access")
		return
	}
	for _, member := range ws.Members {
		if member.UserID == user.ID {
			writeErr(w, http.StatusConflict, "that person is already a member")
			return
		}
	}
	if len(ws.Members) >= 100 {
		writeErr(w, http.StatusBadRequest, "this workspace has reached the member limit")
		return
	}

	member := model.Member{
		UserID: user.ID, Name: user.Name, Email: user.Email,
		Role: req.Role, JoinedAt: time.Now().UTC(),
	}
	result, err := s.store.Workspaces.UpdateOne(r.Context(),
		bson.M{"_id": wsID, "members.userId": bson.M{"$ne": user.ID}},
		bson.M{
			"$push": bson.M{"members": member},
			"$set":  bson.M{"updatedAt": time.Now().UTC()},
		},
	)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not invite that person")
		return
	}
	if result.ModifiedCount == 0 {
		writeErr(w, http.StatusConflict, "that person is already a member")
		return
	}
	writeJSON(w, http.StatusCreated, memberView{
		UserID: member.UserID, Name: member.Name, Email: member.Email,
		Role: member.Role, JoinedAt: member.JoinedAt,
	})
}

type updateMemberRequest struct {
	Role string `json:"role"`
}

func (s *Server) updateMember(w http.ResponseWriter, r *http.Request) {
	wsID := objectIDFromParam(r, "workspaceID")
	_, role, err := s.accessibleWorkspace(r, wsID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	if role != roleOwner {
		writeErr(w, http.StatusForbidden, "only the workspace owner can change roles")
		return
	}
	memberID, err := primitive.ObjectIDFromHex(chiURLParam(r, "userID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var req updateMemberRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Role != roleEditor && req.Role != roleViewer {
		writeErr(w, http.StatusBadRequest, "role must be editor or viewer")
		return
	}
	result, err := s.store.Workspaces.UpdateOne(r.Context(),
		bson.M{"_id": wsID, "members.userId": memberID},
		bson.M{
			"$set": bson.M{"members.$.role": req.Role, "updatedAt": time.Now().UTC()},
		},
	)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update member")
		return
	}
	if result.MatchedCount == 0 {
		writeErr(w, http.StatusNotFound, "member not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"role": req.Role})
}

func (s *Server) removeMember(w http.ResponseWriter, r *http.Request) {
	wsID := objectIDFromParam(r, "workspaceID")
	_, role, err := s.accessibleWorkspace(r, wsID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	if role != roleOwner {
		writeErr(w, http.StatusForbidden, "only the workspace owner can remove people")
		return
	}
	memberID, err := primitive.ObjectIDFromHex(chiURLParam(r, "userID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid user id")
		return
	}
	result, err := s.store.Workspaces.UpdateOne(r.Context(),
		bson.M{"_id": wsID},
		bson.M{
			"$pull": bson.M{"members": bson.M{"userId": memberID}},
			"$set":  bson.M{"updatedAt": time.Now().UTC()},
		},
		options.Update(),
	)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not remove member")
		return
	}
	if result.ModifiedCount == 0 {
		writeErr(w, http.StatusNotFound, "member not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func objectIDFromParam(r *http.Request, key string) primitive.ObjectID {
	id, _ := primitive.ObjectIDFromHex(chiURLParam(r, key))
	return id
}
