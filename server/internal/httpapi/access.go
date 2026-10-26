package httpapi

import (
	"context"
	"net/http"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"github.com/motion/server/internal/model"
)

const (
	roleOwner  = "owner"
	roleEditor = "editor"
	roleViewer = "viewer"
)

func roleOf(workspace model.Workspace, userID primitive.ObjectID) (string, bool) {
	if workspace.OwnerID == userID {
		return roleOwner, true
	}
	for _, member := range workspace.Members {
		if member.UserID == userID {
			role := member.Role
			if role != roleViewer {
				role = roleEditor
			}
			return role, true
		}
	}
	return "", false
}

func canEdit(role string) bool {
	return role == roleOwner || role == roleEditor
}

// accessibleWorkspaceFor loads a workspace a user owns or belongs to.
func (s *Server) accessibleWorkspaceFor(ctx context.Context, wsID, userID primitive.ObjectID) (model.Workspace, string, error) {
	var ws model.Workspace
	if err := s.store.Workspaces.FindOne(ctx, bson.M{"_id": wsID}).Decode(&ws); err != nil {
		return model.Workspace{}, "", err
	}
	role, ok := roleOf(ws, userID)
	if !ok {
		return model.Workspace{}, "", mongo.ErrNoDocuments
	}
	return ws, role, nil
}

func (s *Server) accessibleWorkspace(r *http.Request, wsID primitive.ObjectID) (model.Workspace, string, error) {
	return s.accessibleWorkspaceFor(r.Context(), wsID, currentUserID(r))
}

func (s *Server) requireEditor(w http.ResponseWriter, r *http.Request, wsID primitive.ObjectID) (model.Workspace, bool) {
	ws, role, err := s.accessibleWorkspace(r, wsID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return model.Workspace{}, false
	}
	if !canEdit(role) {
		writeErr(w, http.StatusForbidden, "you do not have permission to edit this workspace")
		return model.Workspace{}, false
	}
	return ws, true
}

func (s *Server) accessiblePageFor(ctx context.Context, pageID, userID primitive.ObjectID) (model.Page, string, error) {
	var page model.Page
	if err := s.store.Pages.FindOne(ctx, bson.M{"_id": pageID}).Decode(&page); err != nil {
		return model.Page{}, "", err
	}
	_, role, err := s.accessibleWorkspaceFor(ctx, page.WorkspaceID, userID)
	if err != nil {
		return model.Page{}, "", err
	}
	return page, role, nil
}

func (s *Server) accessiblePage(r *http.Request, pageID primitive.ObjectID) (model.Page, string, error) {
	return s.accessiblePageFor(r.Context(), pageID, currentUserID(r))
}

func (s *Server) editablePage(w http.ResponseWriter, r *http.Request, pageID primitive.ObjectID) (model.Page, bool) {
	page, role, err := s.accessiblePage(r, pageID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return model.Page{}, false
	}
	if !canEdit(role) {
		writeErr(w, http.StatusForbidden, "you do not have permission to edit this page")
		return model.Page{}, false
	}
	return page, true
}
