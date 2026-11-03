package httpapi

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
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
	diagrams := exportDiagrams(w, r, format)
	var data []byte
	var contentType, extension string
	switch format {
	case "html":
		data, err = export.HTML(page)
		contentType, extension = "text/html; charset=utf-8", ".html"
	case "pdf":
		data, err = export.PDF(page, diagrams)
		contentType, extension = "application/pdf", ".pdf"
	case "docx", "word":
		data, err = export.DOCX(page, diagrams)
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

// exportDiagrams reads browser-rendered Mermaid images from a POST body. The
// GET export path stays unchanged and falls back to Mermaid source text.
func exportDiagrams(w http.ResponseWriter, r *http.Request, format string) map[string]export.Diagram {
	if r.Method != http.MethodPost || (format != "pdf" && format != "docx" && format != "word") {
		return nil
	}
	r.Body = http.MaxBytesReader(w, r.Body, 64<<20)
	var req struct {
		Diagrams map[string]struct {
			SVG    string `json:"svg"`
			PNG    string `json:"png"`
			Width  int    `json:"width"`
			Height int    `json:"height"`
		} `json:"diagrams"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
		return nil
	}
	out := make(map[string]export.Diagram, len(req.Diagrams))
	for blockID, item := range req.Diagrams {
		if len(out) >= 40 {
			break
		}
		png, err := base64.StdEncoding.DecodeString(item.PNG)
		if err != nil {
			png = nil
		}
		svg, err := base64.StdEncoding.DecodeString(item.SVG)
		if err != nil {
			// The editor sends SVG markup as-is; API clients may send base64.
			svg = []byte(item.SVG)
		}
		if len(png) > 8<<20 || len(svg) > 3<<20 {
			continue
		}
		if len(png) > 0 && !bytes.HasPrefix(png, []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}) {
			continue
		}
		trimmed := bytes.TrimSpace(svg)
		if len(trimmed) > 0 && !bytes.HasPrefix(trimmed, []byte("<svg")) && !bytes.HasPrefix(trimmed, []byte("<?xml")) {
			continue
		}
		if len(png) == 0 && len(trimmed) == 0 {
			continue
		}
		width, height := item.Width, item.Height
		if width < 10 || width > 4000 {
			width = 800
		}
		if height < 10 || height > 4000 {
			height = 600
		}
		out[blockID] = export.Diagram{SVG: trimmed, PNG: png, Width: width, Height: height}
	}
	return out
}

// exportJob tracks a background workspace export.
type exportJob struct {
	ID          string
	WorkspaceID primitive.ObjectID
	Format      string
	Status      string // queued, running, done, failed
	Done        int
	Total       int
	Path        string
	Size        int64
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
			if job.Path != "" {
				_ = os.Remove(job.Path)
			}
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
	status, done, total, size, jobErr := job.Status, job.Done, job.Total, job.Size, job.Error
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
	if job.Status != "done" || job.Path == "" {
		exportJobs.Unlock()
		writeErr(w, http.StatusConflict, "export is not ready yet")
		return
	}
	path, size := job.Path, job.Size
	exportJobs.Unlock()
	file, err := os.Open(path)
	if err != nil {
		writeErr(w, http.StatusGone, "export file has expired")
		return
	}
	defer file.Close()
	filename := "motion-export.zip"
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	w.Header().Set("Content-Length", strconv.FormatInt(size, 10))
	_, _ = io.Copy(w, file)
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
	file, err := os.CreateTemp("", "motion-export-*.zip")
	if err != nil {
		updateExportJob(job, func(j *exportJob) { j.Status = "failed"; j.Error = "could not create export file" })
		return
	}
	path := file.Name()
	complete := false
	defer func() {
		_ = file.Close()
		if !complete {
			_ = os.Remove(path)
		}
	}()
	zw := zip.NewWriter(file)
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
	if err := file.Close(); err != nil {
		updateExportJob(job, func(j *exportJob) { j.Status = "failed"; j.Error = "could not finish export" })
		return
	}
	info, err := os.Stat(path)
	if err != nil {
		updateExportJob(job, func(j *exportJob) { j.Status = "failed"; j.Error = "could not finish export" })
		return
	}
	complete = true
	updateExportJob(job, func(j *exportJob) { j.Path = path; j.Size = info.Size(); j.Status = "done" })
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
