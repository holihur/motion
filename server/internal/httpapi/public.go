package httpapi

import (
	"context"
	"crypto/rand"
	"fmt"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/staticpublish"
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

func (s *Server) ensurePublicSlug(ctx context.Context) (string, error) {
	for i := 0; i < 5; i++ {
		candidate := randomPublicSlug()
		var existing model.Page
		err := s.store.Pages.FindOne(ctx, bson.M{"publicSlug": candidate}).Decode(&existing)
		if err != nil {
			return candidate, nil
		}
	}
	return "", fmt.Errorf("could not allocate a public link")
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
	var req struct {
		IncludeChildren bool `json:"includeChildren"`
	}
	_ = decodeJSON(r, &req)

	targets := []primitive.ObjectID{page.ID}
	if req.IncludeChildren {
		if ids, err := s.descendantIDs(r, page.WorkspaceID, page.ID); err == nil {
			for id := range ids {
				targets = append(targets, id)
			}
		}
	}
	slug := strings.TrimSpace(page.PublicSlug)
	for _, target := range targets {
		var current model.Page
		if err := s.store.Pages.FindOne(r.Context(), bson.M{"_id": target, "archived": false}).Decode(&current); err != nil {
			continue
		}
		if strings.TrimSpace(current.PublicSlug) != "" {
			continue
		}
		candidate, err := s.ensurePublicSlug(r.Context())
		if err != nil {
			continue
		}
		if _, err := s.store.Pages.UpdateByID(r.Context(), target, bson.M{"$set": bson.M{
			"publicSlug": candidate, "updatedAt": time.Now().UTC(),
		}}); err != nil {
			continue
		}
		if target == page.ID {
			slug = candidate
		}
	}
	if slug == "" {
		writeErr(w, http.StatusInternalServerError, "could not allocate a public link")
		return
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
	var req struct {
		IncludeChildren bool `json:"includeChildren"`
	}
	_ = decodeJSON(r, &req)
	targets := []primitive.ObjectID{page.ID}
	if req.IncludeChildren {
		if ids, err := s.descendantIDs(r, page.WorkspaceID, page.ID); err == nil {
			for id := range ids {
				targets = append(targets, id)
			}
		}
	}
	if _, err := s.store.Pages.UpdateMany(r.Context(), bson.M{"_id": bson.M{"$in": targets}}, bson.M{"$unset": bson.M{"publicSlug": ""}}); err != nil {
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
	// 子页面跟随：已发布的后代建成 /p/slug 映射，未发布的保持 "#"。
	links := map[string]string{page.ID.Hex(): "/p/" + slug}
	if ids, err := s.descendantIDs(r, page.WorkspaceID, page.ID); err == nil && len(ids) > 0 {
		list := make([]primitive.ObjectID, 0, len(ids))
		for id := range ids {
			list = append(list, id)
		}
		cur, err := s.store.Pages.Find(r.Context(), bson.M{
			"_id": bson.M{"$in": list}, "archived": false,
			"publicSlug": bson.M{"$ne": ""},
		})
		if err == nil {
			defer cur.Close(r.Context())
			var published []model.Page
			if err := cur.All(r.Context(), &published); err == nil {
				for _, child := range published {
					links[child.ID.Hex()] = "/p/" + child.PublicSlug
				}
			}
		}
	}
	// 直接子页面导航（未发布的自动跳过）。
	var direct []model.Page
	if cur, err := s.store.Pages.Find(r.Context(), bson.M{
		"workspaceId": page.WorkspaceID, "parentId": page.ID, "archived": false,
	}); err == nil {
		_ = cur.All(r.Context(), &direct)
		cur.Close(r.Context())
	}
	data := staticpublish.RenderPublicPage(page, direct, links)
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Robots-Tag", "noindex")
	w.Header().Set("Cache-Control", "public, max-age=60")
	_, _ = w.Write(data)
}
