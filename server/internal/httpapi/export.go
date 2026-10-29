package httpapi

import (
	"archive/zip"
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/export"
	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/staticpublish"
)

func (s *Server) exportPage(w http.ResponseWriter, r *http.Request) {
	id, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, _, err := s.accessiblePage(r, id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	page = s.applyLayout(r.Context(), page)
	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	name := staticpublish.Slug(page.Title, page.ID)
	var data []byte
	var contentType, extension string
	switch format {
	case "html":
		data, err = export.HTML(page)
		contentType, extension = "text/html; charset=utf-8", ".html"
	case "pdf":
		data, err = export.PDF(page)
		contentType, extension = "application/pdf", ".pdf"
	case "docx", "word":
		data, err = export.DOCX(page)
		contentType, extension = "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"
	default:
		writeErr(w, http.StatusBadRequest, "format must be html, pdf or docx")
		return
	}
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not export page")
		return
	}
	_, actorName := s.editorFor(r)
	s.writeAudit(r.Context(), page.WorkspaceID, currentUserID(r), actorName, primitive.NilObjectID, "",
		"page.export", "page", page.ID.Hex(), "Exported "+page.Title+" as "+format)
	filename := name + extension
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"; filename*=UTF-8''"+url.PathEscape(filename))
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
}

// GET /workspaces/{workspaceID}/export?format=md|html — whole-workspace zip for backup/migration.
func (s *Server) exportWorkspace(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format != "md" && format != "markdown" && format != "html" {
		writeErr(w, http.StatusBadRequest, "format must be md or html")
		return
	}
	asHTML := format == "html"
	ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
	defer cancel()
	cur, err := s.store.Pages.Find(ctx, bson.M{"workspaceId": wsID, "archived": false})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load pages")
		return
	}
	defer cur.Close(ctx)
	var pages []model.Page
	if err := cur.All(ctx, &pages); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load pages")
		return
	}
	if len(pages) > 2000 {
		pages = pages[:2000]
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	used := map[string]int{}
	for _, page := range pages {
		name := staticpublish.Slug(page.Title, page.ID)
		if n, ok := used[name]; ok {
			used[name] = n + 1
			name = fmt.Sprintf("%s-%d", name, n+1)
		} else {
			used[name] = 1
		}
		var data []byte
		ext := ".md"
		if asHTML {
			data, err = export.HTML(page)
			ext = ".html"
		} else {
			data = export.Markdown(page)
		}
		if err != nil {
			continue
		}
		fw, err := zw.Create(name + ext)
		if err != nil {
			continue
		}
		_, _ = fw.Write(data)
	}
	if err := zw.Close(); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not build export")
		return
	}
	_, actorName := s.editorFor(r)
	s.writeAudit(ctx, wsID, currentUserID(r), actorName, primitive.NilObjectID, "",
		"workspace.export", "workspace", wsID.Hex(), fmt.Sprintf("Exported %d pages as %s", len(pages), format))
	filename := "motion-export.zip"
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	w.Header().Set("Content-Length", strconv.Itoa(buf.Len()))
	_, _ = w.Write(buf.Bytes())
}
