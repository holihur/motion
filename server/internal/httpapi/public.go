package httpapi

import (
	"crypto/rand"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/export"
	"github.com/motion/server/internal/model"
)

const publicSlugAlphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

func randomPublicSlug() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		return primitive.NewObjectID().Hex()[:12]
	}
	out := make([]byte, 12)
	for i, v := range b {
		out[i] = publicSlugAlphabet[int(v)%len(publicSlugAlphabet)]
	}
	return string(out)
}

// POST /api/pages/{pageID}/publish — make the page public at /p/{slug}.
func (s *Server) publishPagePublic(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}
	if page.Archived {
		writeErr(w, http.StatusBadRequest, "archived pages cannot be published")
		return
	}
	slug := strings.TrimSpace(page.PublicSlug)
	if slug == "" {
		for i := 0; i < 5; i++ {
			candidate := randomPublicSlug()
			var existing model.Page
			err := s.store.Pages.FindOne(r.Context(), bson.M{"publicSlug": candidate}).Decode(&existing)
			if err != nil {
				slug = candidate
				break
			}
		}
		if slug == "" {
			writeErr(w, http.StatusInternalServerError, "could not allocate a public link")
			return
		}
		if _, err := s.store.Pages.UpdateByID(r.Context(), page.ID, bson.M{"$set": bson.M{
			"publicSlug": slug, "updatedAt": time.Now().UTC(),
		}}); err != nil {
			writeErr(w, http.StatusInternalServerError, "could not publish page")
			return
		}
	}
	_, actorName := s.editorFor(r)
	s.writeAudit(r.Context(), page.WorkspaceID, currentUserID(r), actorName, primitive.NilObjectID, "",
		"page.publish", "page", page.ID.Hex(), "Published “"+page.Title+"” to the web")
	writeJSON(w, http.StatusOK, map[string]any{"slug": slug, "url": "/p/" + slug})
}

// DELETE /api/pages/{pageID}/publish — take the page offline.
func (s *Server) unpublishPagePublic(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}
	if _, err := s.store.Pages.UpdateByID(r.Context(), page.ID, bson.M{"$unset": bson.M{"publicSlug": ""}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not unpublish page")
		return
	}
	_, actorName := s.editorFor(r)
	s.writeAudit(r.Context(), page.WorkspaceID, currentUserID(r), actorName, primitive.NilObjectID, "",
		"page.unpublish", "page", page.ID.Hex(), "Unpublished “"+page.Title+"” from the web")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /p/{slug} — public page, no auth. Renders the current revision live.
func (s *Server) servePublicPage(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chiURLParam(r, "slug"))
	if slug == "" || len(slug) > 64 {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	var page model.Page
	if err := s.store.Pages.FindOne(r.Context(), bson.M{"publicSlug": slug, "archived": false}).Decode(&page); err != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	page = s.applyLayout(r.Context(), page)
	data, err := export.HTML(page)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not render page")
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Robots-Tag", "noindex")
	w.Header().Set("Cache-Control", "public, max-age=60")
	_, _ = w.Write(data)
}
