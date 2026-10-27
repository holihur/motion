package httpapi

import (
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/export"
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
	filename := name + extension
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"; filename*=UTF-8''"+url.PathEscape(filename))
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
}
