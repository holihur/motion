package httpapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

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
		IncludeChildren bool    `json:"includeChildren"`
		Password        *string `json:"password"`
		ExpiresAt       *string `json:"expiresAt"`
		Comments        *bool   `json:"comments"`
	}
	_ = decodeJSON(r, &req)

	// 发布设置（password 空字符串=清除密码；expiresAt 空=永不过期）。
	settings := bson.M{"updatedAt": time.Now().UTC()}
	if req.Password != nil {
		if strings.TrimSpace(*req.Password) == "" {
			settings["publicPasswordHash"] = ""
		} else {
			sum := sha256.Sum256([]byte(*req.Password))
			settings["publicPasswordHash"] = hex.EncodeToString(sum[:])
		}
	}
	if req.ExpiresAt != nil {
		if strings.TrimSpace(*req.ExpiresAt) == "" {
			settings["publicExpiresAt"] = nil
		} else if ts, err := time.Parse(time.RFC3339, strings.TrimSpace(*req.ExpiresAt)); err == nil {
			settings["publicExpiresAt"] = ts
		}
	}
	if req.Comments != nil {
		settings["publicComment"] = *req.Comments
	}
	if _, err := s.store.Pages.UpdateByID(r.Context(), page.ID, bson.M{"$set": settings}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save publish settings")
		return
	}

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

// GET /api/pages/{pageID}/publish — publish status for the dialog.
func (s *Server) publishStatus(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}
	locked := strings.TrimSpace(page.PublicPasswordHash) != ""
	var expires *string
	if page.PublicExpiresAt != nil {
		v := page.PublicExpiresAt.UTC().Format(time.RFC3339)
		expires = &v
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"slug": page.PublicSlug, "locked": locked,
		"expiresAt": expires, "views": page.PublicViews,
		"comments": page.PublicComment,
	})
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

func publicCookieName(slug string) string {
	sum := sha256.Sum256([]byte("motion-pub:" + slug))
	return "motion_pub_" + hex.EncodeToString(sum[:])[:16]
}

func publicUnlocked(r *http.Request, slug, hash string) bool {
	cookie, err := r.Cookie(publicCookieName(slug))
	if err != nil {
		return false
	}
	return cookie.Value == hash
}

// POST /p/{slug}/unlock — password gate (form or JSON).
func (s *Server) unlockPublicPage(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chiURLParam(r, "slug"))
	var page model.Page
	if slug == "" || s.store.Pages.FindOne(r.Context(), bson.M{"publicSlug": slug, "archived": false}).Decode(&page) != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	if strings.TrimSpace(page.PublicPasswordHash) == "" {
		http.Redirect(w, r, "/p/"+slug, http.StatusSeeOther)
		return
	}
	password := strings.TrimSpace(r.FormValue("password"))
	if password == "" {
		var body struct {
			Password string `json:"password"`
		}
		_ = decodeJSON(r, &body)
		password = strings.TrimSpace(body.Password)
	}
	sum := sha256.Sum256([]byte(password))
	if hex.EncodeToString(sum[:]) != page.PublicPasswordHash {
		if strings.Contains(r.Header.Get("Content-Type"), "application/json") {
			writeErr(w, http.StatusForbidden, "wrong password")
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(staticpublish.UnlockPage(page.Title))
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: publicCookieName(slug), Value: page.PublicPasswordHash,
		Path: "/p/" + slug, MaxAge: 30 * 24 * 3600, HttpOnly: true, SameSite: http.SameSiteLaxMode,
	})
	http.Redirect(w, r, "/p/"+slug, http.StatusSeeOther)
}

// GET /p/{slug}/comments — public comment list.
func (s *Server) listPublicComments(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chiURLParam(r, "slug"))
	var page model.Page
	if slug == "" || s.store.Pages.FindOne(r.Context(), bson.M{"publicSlug": slug, "archived": false}).Decode(&page) != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	if !page.PublicComment {
		writeErr(w, http.StatusForbidden, "comments are disabled")
		return
	}
	if strings.TrimSpace(page.PublicPasswordHash) != "" && !publicUnlocked(r, slug, page.PublicPasswordHash) {
		writeErr(w, http.StatusForbidden, "page is protected")
		return
	}
	cur, err := s.store.Comments.Find(r.Context(), bson.M{"pageId": page.ID, "public": true},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}).SetLimit(200))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load comments")
		return
	}
	defer cur.Close(r.Context())
	type item struct {
		Name string `json:"name"`
		Body string `json:"body"`
		At   string `json:"at"`
	}
	out := []item{}
	var comments []model.Comment
	if err := cur.All(r.Context(), &comments); err == nil {
		for _, c := range comments {
			out = append(out, item{Name: c.AuthorName, Body: c.Body, At: c.CreatedAt.Format("2006-01-02 15:04")})
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

// POST /p/{slug}/comments {name, body} — anonymous public comment.
func (s *Server) postPublicComment(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chiURLParam(r, "slug"))
	var page model.Page
	if slug == "" || s.store.Pages.FindOne(r.Context(), bson.M{"publicSlug": slug, "archived": false}).Decode(&page) != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	if !page.PublicComment {
		writeErr(w, http.StatusForbidden, "comments are disabled")
		return
	}
	if strings.TrimSpace(page.PublicPasswordHash) != "" && !publicUnlocked(r, slug, page.PublicPasswordHash) {
		writeErr(w, http.StatusForbidden, "page is protected")
		return
	}
	var req struct {
		Name string `json:"name"`
		Body string `json:"body"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	name := strings.TrimSpace(req.Name)
	body := strings.TrimSpace(req.Body)
	if name == "" || body == "" || len([]rune(body)) > 2000 || len([]rune(name)) > 40 {
		writeErr(w, http.StatusBadRequest, "name and body are required (body up to 2000 chars)")
		return
	}
	now := time.Now().UTC()
	comment := model.Comment{
		ID: primitive.NewObjectID(), PageID: page.ID, WorkspaceID: page.WorkspaceID,
		AuthorName: name, Body: body, Public: true, CreatedAt: now, UpdatedAt: now,
	}
	if _, err := s.store.Comments.InsertOne(r.Context(), comment); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save comment")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"ok": true})
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
	if page.PublicExpiresAt != nil && time.Now().UTC().After(*page.PublicExpiresAt) {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	if strings.TrimSpace(page.PublicPasswordHash) != "" && !publicUnlocked(r, slug, page.PublicPasswordHash) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("X-Robots-Tag", "noindex")
		_, _ = w.Write(staticpublish.UnlockPage(page.Title))
		return
	}
	_, _ = s.store.Pages.UpdateByID(r.Context(), page.ID, bson.M{"$inc": bson.M{"publicViews": 1}})
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
	desc := ""
	if len(page.Blocks) > 0 {
		var parts []string
		for _, b := range page.Blocks {
			if t := strings.TrimSpace(b.Text); t != "" {
				parts = append(parts, t)
				if len(strings.Join(parts, " ")) > 300 {
					break
				}
			}
		}
		desc = strings.Join(parts, " ")
	}
	data := staticpublish.RenderPublicPage(page, direct, links, staticpublish.PublicExtra{
		Description: desc, Slug: slug, AllowComments: page.PublicComment,
	})
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("X-Robots-Tag", "noindex")
	w.Header().Set("Cache-Control", "public, max-age=60")
	_, _ = w.Write(data)
}
