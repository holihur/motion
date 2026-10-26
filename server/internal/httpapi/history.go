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
	"github.com/motion/server/internal/realtime"
)

const revisionInterval = 2 * time.Minute

func textFromBlocks(blocks []model.Block) string {
	text := make([]string, 0, len(blocks))
	for _, block := range blocks {
		text = append(text, strings.ToLower(block.Text))
	}
	return strings.Join(text, "\n")
}

func (s *Server) createRevision(r *http.Request, page model.Page, authorName string) (model.PageRevision, error) {
	revision := model.PageRevision{
		ID:          primitive.NewObjectID(),
		PageID:      page.ID,
		WorkspaceID: page.WorkspaceID,
		Title:       page.Title,
		Icon:        page.Icon,
		Cover:       page.Cover,
		Blocks:      append([]model.Block(nil), page.Blocks...),
		AuthorID:    currentUserID(r),
		AuthorName:  authorName,
		CreatedAt:   time.Now().UTC(),
	}
	_, err := s.store.Revisions.InsertOne(r.Context(), revision)
	return revision, err
}

func (s *Server) maybeSnapshot(r *http.Request, page model.Page, authorName string) {
	if authorName == "" {
		_, authorName = s.editorFor(r)
	}
	var latest model.PageRevision
	err := s.store.Revisions.FindOne(r.Context(), bson.M{"pageId": page.ID},
		options.FindOne().SetSort(bson.D{{Key: "createdAt", Value: -1}})).
		Decode(&latest)
	if err == nil && time.Since(latest.CreatedAt) < revisionInterval {
		return
	}
	if err != nil && err != mongo.ErrNoDocuments {
		return
	}
	_, _ = s.createRevision(r, page, authorName)
}

func (s *Server) listRevisions(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	if _, _, err := s.accessiblePage(r, pageID); err != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	cur, err := s.store.Revisions.Find(r.Context(), bson.M{"pageId": pageID},
		options.Find().
			SetProjection(bson.M{"blocks": 0}).
			SetSort(bson.D{{Key: "createdAt", Value: -1}}).
			SetLimit(100))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load history")
		return
	}
	defer cur.Close(r.Context())
	revisions := make([]model.PageRevision, 0)
	if err := cur.All(r.Context(), &revisions); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load history")
		return
	}
	writeJSON(w, http.StatusOK, revisions)
}

func (s *Server) createSnapshot(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}
	_, name := s.editorFor(r)
	revision, err := s.createRevision(r, page, name)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save version")
		return
	}
	writeJSON(w, http.StatusCreated, revision)
}

func (s *Server) getRevision(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	if _, _, err := s.accessiblePage(r, pageID); err != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	revisionID, err := primitive.ObjectIDFromHex(chiURLParam(r, "revisionID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid revision id")
		return
	}
	var revision model.PageRevision
	if err := s.store.Revisions.FindOne(r.Context(), bson.M{"_id": revisionID, "pageId": pageID}).Decode(&revision); err != nil {
		writeErr(w, http.StatusNotFound, "version not found")
		return
	}
	writeJSON(w, http.StatusOK, revision)
}

func (s *Server) restoreRevision(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}
	revisionID, err := primitive.ObjectIDFromHex(chiURLParam(r, "revisionID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid revision id")
		return
	}
	var revision model.PageRevision
	if err := s.store.Revisions.FindOne(r.Context(), bson.M{"_id": revisionID, "pageId": pageID}).Decode(&revision); err != nil {
		writeErr(w, http.StatusNotFound, "version not found")
		return
	}

	_, name := s.editorFor(r)
	// Keep the current state as a version so a restore can itself be undone.
	_, _ = s.createRevision(r, page, name)

	blocks := revision.Blocks
	if blocks == nil {
		blocks = []model.Block{}
	}
	now := time.Now().UTC()
	if _, err := s.store.Pages.UpdateByID(r.Context(), pageID, bson.M{"$set": bson.M{
		"title":     revision.Title,
		"icon":      revision.Icon,
		"cover":     revision.Cover,
		"blocks":    blocks,
		"blocksRev": page.BlocksRev + 1,
		"text":      textFromBlocks(blocks),
		"updatedAt": now,
	}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not restore version")
		return
	}
	page.Title, page.Icon, page.Cover, page.Blocks = revision.Title, revision.Icon, revision.Cover, blocks
	page.BlocksRev++

	userID := currentUserID(r).Hex()
	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "blocks", "pageId": page.ID.Hex(), "clientId": clientID(r),
		"blocks": blocks, "updatedAt": now,
		"editor": map[string]string{"userId": userID, "name": name, "color": realtime.ColorFor(userID)},
	}, clientID(r))
	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "meta", "pageId": page.ID.Hex(), "clientId": clientID(r),
		"page":   map[string]any{"title": page.Title, "icon": page.Icon, "cover": page.Cover},
		"editor": map[string]string{"userId": userID, "name": name, "color": realtime.ColorFor(userID)},
	}, clientID(r))
	s.broadcastTree(page.WorkspaceID, clientID(r))
	writeJSON(w, http.StatusOK, page)
}
