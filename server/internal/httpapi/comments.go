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

func (s *Server) listComments(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	if _, _, err := s.accessiblePage(r, pageID); err != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	cur, err := s.store.Comments.Find(r.Context(), bson.M{"pageId": pageID},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}).SetLimit(1000))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load comments")
		return
	}
	defer cur.Close(r.Context())
	comments := make([]model.Comment, 0)
	if err := cur.All(r.Context(), &comments); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load comments")
		return
	}
	writeJSON(w, http.StatusOK, comments)
}

type createCommentRequest struct {
	BlockID     string                   `json:"blockId"`
	Quote       string                   `json:"quote"`
	StartOffset int                      `json:"startOffset"`
	EndOffset   int                      `json:"endOffset"`
	Body        string                   `json:"body"`
	ParentID    *string                  `json:"parentId"`
	Annotation  *model.CommentAnnotation `json:"annotation"`
}

func (s *Server) createComment(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, role, err := s.accessiblePage(r, pageID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	if !canEdit(role) {
		writeErr(w, http.StatusForbidden, "you do not have permission to comment")
		return
	}
	var req createCommentRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	req.Quote = strings.TrimSpace(req.Quote)
	if req.Body == "" || len([]rune(req.Body)) > 5000 {
		writeErr(w, http.StatusBadRequest, "comment must be between 1 and 5000 characters")
		return
	}
	if len([]rune(req.Quote)) > 500 {
		writeErr(w, http.StatusBadRequest, "selection is too long to comment on")
		return
	}

	now := time.Now().UTC()
	comment := model.Comment{
		ID:          primitive.NewObjectID(),
		PageID:      pageID,
		WorkspaceID: page.WorkspaceID,
		BlockID:     req.BlockID,
		Quote:       req.Quote,
		StartOffset: max(0, req.StartOffset),
		EndOffset:   max(0, req.EndOffset),
		Annotation:  req.Annotation,
		Body:        req.Body,
		AuthorID:    currentUserID(r),
		AuthorName:  "",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	_, name := s.editorFor(r)
	comment.AuthorName = name

	if req.ParentID != nil && strings.TrimSpace(*req.ParentID) != "" {
		parentID, err := primitive.ObjectIDFromHex(*req.ParentID)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid parent comment id")
			return
		}
		var parent model.Comment
		if err := s.store.Comments.FindOne(r.Context(), bson.M{"_id": parentID, "pageId": pageID}).Decode(&parent); err != nil {
			writeErr(w, http.StatusBadRequest, "parent comment not found")
			return
		}
		if parent.ParentID != nil {
			writeErr(w, http.StatusBadRequest, "replies can only be one level deep")
			return
		}
		comment.ParentID = &parentID
		comment.BlockID = parent.BlockID
		comment.Quote = parent.Quote
		comment.StartOffset = parent.StartOffset
		comment.EndOffset = parent.EndOffset
		comment.Annotation = parent.Annotation
	} else {
		found := false
		for _, block := range page.Blocks {
			if block.ID == req.BlockID {
				found = true
				break
			}
		}
		if !found {
			writeErr(w, http.StatusBadRequest, "block not found")
			return
		}
	}

	if req.Annotation != nil {
		a := req.Annotation
		if a.X < 0 || a.Y < 0 || a.X > 100 || a.Y > 100 || a.Width <= 0 || a.Height <= 0 || a.X+a.Width > 100.01 || a.Y+a.Height > 100.01 {
			writeErr(w, http.StatusBadRequest, "invalid image annotation")
			return
		}
	}

	if _, err := s.store.Comments.InsertOne(r.Context(), comment); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save comment")
		return
	}
	s.hub.Broadcast(pageID.Hex(), map[string]any{
		"type": "comments", "pageId": pageID.Hex(), "action": "created",
		"clientId": clientID(r),
	}, clientID(r))
	s.webhooks.Emit(r.Context(), page.WorkspaceID, "comment.created", map[string]any{
		"pageId": pageID.Hex(), "pageTitle": page.Title, "commentId": comment.ID.Hex(),
		"author": name, "body": comment.Body, "quote": comment.Quote,
	})
	writeJSON(w, http.StatusCreated, comment)
}

func (s *Server) updateComment(w http.ResponseWriter, r *http.Request) {
	commentID, err := primitive.ObjectIDFromHex(chiURLParam(r, "commentID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid comment id")
		return
	}
	var comment model.Comment
	if err := s.store.Comments.FindOne(r.Context(), bson.M{"_id": commentID}).Decode(&comment); err != nil {
		writeErr(w, http.StatusNotFound, "comment not found")
		return
	}
	page, role, err := s.accessiblePage(r, comment.PageID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "comment not found")
		return
	}
	if !canEdit(role) {
		writeErr(w, http.StatusForbidden, "you do not have permission to edit this comment")
		return
	}
	var req struct {
		Body     *string `json:"body"`
		Resolved *bool   `json:"resolved"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	updates := bson.M{"updatedAt": time.Now().UTC()}
	if req.Body != nil {
		if comment.AuthorID != currentUserID(r) && role != roleOwner {
			writeErr(w, http.StatusForbidden, "only the author can edit this comment")
			return
		}
		body := strings.TrimSpace(*req.Body)
		if body == "" || len([]rune(body)) > 5000 {
			writeErr(w, http.StatusBadRequest, "comment must be between 1 and 5000 characters")
			return
		}
		updates["body"] = body
	}
	if req.Resolved != nil {
		updates["resolved"] = *req.Resolved
	}
	if _, err := s.store.Comments.UpdateByID(r.Context(), commentID, bson.M{"$set": updates}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update comment")
		return
	}
	if err := s.store.Comments.FindOne(r.Context(), bson.M{"_id": commentID}).Decode(&comment); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load comment")
		return
	}
	s.hub.Broadcast(comment.PageID.Hex(), map[string]any{
		"type": "comments", "pageId": comment.PageID.Hex(), "action": "updated",
		"clientId": clientID(r),
	}, clientID(r))
	_ = page
	writeJSON(w, http.StatusOK, comment)
}

func (s *Server) deleteComment(w http.ResponseWriter, r *http.Request) {
	commentID, err := primitive.ObjectIDFromHex(chiURLParam(r, "commentID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid comment id")
		return
	}
	var comment model.Comment
	if err := s.store.Comments.FindOne(r.Context(), bson.M{"_id": commentID}).Decode(&comment); err != nil {
		writeErr(w, http.StatusNotFound, "comment not found")
		return
	}
	_, role, err := s.accessiblePage(r, comment.PageID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "comment not found")
		return
	}
	if comment.AuthorID != currentUserID(r) && role != roleOwner {
		writeErr(w, http.StatusForbidden, "only the author or workspace owner can delete this comment")
		return
	}
	if _, err := s.store.Comments.DeleteMany(r.Context(), bson.M{
		"pageId": comment.PageID,
		"$or":    []bson.M{{"_id": commentID}, {"parentId": commentID}},
	}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not delete comment")
		return
	}
	s.hub.Broadcast(comment.PageID.Hex(), map[string]any{
		"type": "comments", "pageId": comment.PageID.Hex(), "action": "deleted",
		"clientId": clientID(r),
	}, clientID(r))
	w.WriteHeader(http.StatusNoContent)
}
