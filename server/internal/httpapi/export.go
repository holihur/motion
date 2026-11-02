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
	"sync"
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

// exportJob tracks a background workspace export.
type exportJob struct {
	ID          string
	WorkspaceID primitive.ObjectID
	Format      string
	Status      string // queued, running, done, failed
	Done        int
	Total       int
	Data        []byte
	Error       string
	CreatedAt   time.Time
}

var exportJobs = struct {
	sync.Mutex
	items map[string]*exportJob
}{items: map[string]*exportJob{}}

// At most two workspace exports run at once; each job buffers its ZIP in memory.
var exportSlots = make(chan struct{}, 2)

func touchExportJobLocked(id string) *exportJob {
	// Evict stale jobs (10min TTL) on access.
	for key, job := range exportJobs.items {
		if time.Since(job.CreatedAt) > 10*time.Minute {
			delete(exportJobs.items, key)
		}
	}
	return exportJobs.items[id]
}

func touchExportJob(id string) *exportJob {
	exportJobs.Lock()
	defer exportJobs.Unlock()
	return touchExportJobLocked(id)
}

func updateExportJob(job *exportJob, update func(*exportJob)) {
	exportJobs.Lock()
	defer exportJobs.Unlock()
	update(job)
}

// POST /workspaces/{workspaceID}/export/jobs?format=md|html — start a background export.
func (s *Server) createExportJob(w http.ResponseWriter, r *http.Request) {
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
	select {
	case exportSlots <- struct{}{}:
	default:
		writeErr(w, http.StatusTooManyRequests, "another export is already running; try again later")
		return
	}
	job := &exportJob{
		ID: primitive.NewObjectID().Hex(), WorkspaceID: wsID,
		Format: format, Status: "queued", CreatedAt: time.Now().UTC(),
	}
	exportJobs.Lock()
	touchExportJobLocked("")
	if len(exportJobs.items) >= 100 {
		exportJobs.Unlock()
		<-exportSlots
		writeErr(w, http.StatusTooManyRequests, "too many export jobs; try again later")
		return
	}
	exportJobs.items[job.ID] = job
	exportJobs.Unlock()
	go s.runExportJob(job)
	writeJSON(w, http.StatusAccepted, map[string]any{"jobId": job.ID, "status": "queued"})
}

// GET /workspaces/{workspaceID}/export/jobs/{jobID} — poll progress.
func (s *Server) getExportJob(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	exportJobs.Lock()
	job := touchExportJobLocked(chiURLParam(r, "jobID"))
	if job == nil || job.WorkspaceID != wsID {
		exportJobs.Unlock()
		writeErr(w, http.StatusNotFound, "export job not found or expired")
		return
	}
	status, done, total, size, jobErr := job.Status, job.Done, job.Total, len(job.Data), job.Error
	exportJobs.Unlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"jobId": job.ID, "status": status,
		"done": done, "total": total, "size": size, "error": jobErr,
	})
}

// GET /workspaces/{workspaceID}/export/jobs/{jobID}/download — fetch the finished zip.
func (s *Server) downloadExportJob(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	exportJobs.Lock()
	job := touchExportJobLocked(chiURLParam(r, "jobID"))
	if job == nil || job.WorkspaceID != wsID {
		exportJobs.Unlock()
		writeErr(w, http.StatusNotFound, "export job not found or expired")
		return
	}
	if job.Status != "done" || job.Data == nil {
		exportJobs.Unlock()
		writeErr(w, http.StatusConflict, "export is not ready yet")
		return
	}
	data := job.Data
	exportJobs.Unlock()
	filename := "motion-export.zip"
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
}

func (s *Server) runExportJob(job *exportJob) {
	defer func() { <-exportSlots }()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	updateExportJob(job, func(j *exportJob) { j.Status = "running" })
	asHTML := job.Format == "html"
	cur, err := s.store.Pages.Find(ctx, bson.M{"workspaceId": job.WorkspaceID, "archived": false})
	if err != nil {
		updateExportJob(job, func(j *exportJob) { j.Status = "failed"; j.Error = "could not load pages" })
		return
	}
	defer cur.Close(ctx)
	var pages []model.Page
	if err := cur.All(ctx, &pages); err != nil {
		updateExportJob(job, func(j *exportJob) { j.Status = "failed"; j.Error = "could not load pages" })
		return
	}
	if len(pages) > 2000 {
		pages = pages[:2000]
	}
	updateExportJob(job, func(j *exportJob) { j.Total = len(pages) })
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	used := map[string]int{}
	for i, page := range pages {
		select {
		case <-ctx.Done():
			updateExportJob(job, func(j *exportJob) { j.Status = "failed"; j.Error = "export timed out" })
			return
		default:
		}
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
			var renderErr error
			data, renderErr = export.HTML(page)
			ext = ".html"
			if renderErr != nil {
				updateExportJob(job, func(j *exportJob) { j.Done = i + 1 })
				continue
			}
		} else {
			data = export.Markdown(page)
		}
		fw, err := zw.Create(name + ext)
		if err == nil {
			_, _ = fw.Write(data)
		}
		updateExportJob(job, func(j *exportJob) { j.Done = i + 1 })
	}
	if err := zw.Close(); err != nil {
		updateExportJob(job, func(j *exportJob) { j.Status = "failed"; j.Error = "could not build export" })
		return
	}
	updateExportJob(job, func(j *exportJob) { j.Data = buf.Bytes(); j.Status = "done" })
	s.writeAudit(ctx, job.WorkspaceID, primitive.NilObjectID, "export", primitive.NilObjectID, "",
		"workspace.export", "workspace", job.WorkspaceID.Hex(),
		fmt.Sprintf("Exported %d pages as %s (background job)", len(pages), job.Format))
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
