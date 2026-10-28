package httpapi

import (
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/gridfs"
	"go.mongodb.org/mongo-driver/mongo/options"
)

const maxUploadBytes = 25 << 20

type uploadResponse struct {
	ID          string `json:"id"`
	URL         string `json:"url"`
	Name        string `json:"name"`
	Size        int64  `json:"size"`
	ContentType string `json:"contentType"`
}

// uploadFile stores attachments in GridFS. Reviewers can fetch the returned
// capability URL without a bearer token, so <img>/<a> work naturally.
func (s *Server) uploadFile(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes+1<<20)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeErr(w, http.StatusBadRequest, "file is too large (maximum 25 MB)")
		return
	}
	if r.MultipartForm != nil {
		defer r.MultipartForm.RemoveAll()
		total := 0
		for _, files := range r.MultipartForm.File {
			total += len(files)
		}
		if total != 1 {
			writeErr(w, http.StatusBadRequest, "upload exactly one file at a time")
			return
		}
	}
	workspaceID, err := primitive.ObjectIDFromHex(strings.TrimSpace(r.FormValue("workspaceId")))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, workspaceID); !ok {
		return
	}
	if !uploadRateLimiter.allow(currentUserID(r).Hex(), 30, time.Minute) {
		w.Header().Set("Retry-After", "60")
		writeErr(w, http.StatusTooManyRequests, "too many uploads; try again in a minute")
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeErr(w, http.StatusBadRequest, "choose a file to upload")
		return
	}
	defer file.Close()
	if header.Size > maxUploadBytes {
		writeErr(w, http.StatusBadRequest, "file is too large (maximum 25 MB)")
		return
	}
	name := safeAttachmentName(header.Filename)
	contentType := header.Header.Get("Content-Type")
	if contentType == "" || contentType == "application/octet-stream" {
		contentType = mime.TypeByExtension(filepath.Ext(name))
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	baseType := strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	switch baseType {
	case "text/html", "application/xhtml+xml", "application/javascript", "text/javascript", "application/x-javascript":
		writeErr(w, http.StatusBadRequest, "this file type is not allowed")
		return
	}
	storage, provider, _, err := s.storageFor(r.Context(), workspaceID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "storage credentials could not be decrypted; save them again")
		return
	}
	if storage != nil {
		content, err := io.ReadAll(io.LimitReader(file, maxUploadBytes+1))
		if err != nil || len(content) > maxUploadBytes {
			writeErr(w, http.StatusBadRequest, "file is too large (maximum 25 MB)")
			return
		}
		publicURL, err := storage.Put(r.Context(), primitive.NewObjectID().Hex()+"-"+name, content, contentType)
		if err != nil {
			writeErr(w, http.StatusBadGateway, "could not upload to "+provider+": "+err.Error())
			return
		}
		writeJSON(w, http.StatusCreated, uploadResponse{ID: primitive.NewObjectID().Hex(), URL: publicURL, Name: name, Size: int64(len(content)), ContentType: contentType})
		return
	}
	bucket, err := gridfs.NewBucket(s.store.DB, options.GridFSBucket().SetName("uploads"))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not open file storage")
		return
	}
	id := primitive.NewObjectID()
	limited := &io.LimitedReader{R: file, N: maxUploadBytes + 1}
	err = bucket.UploadFromStreamWithID(id, name, limited, options.GridFSUpload().
		SetMetadata(bson.M{"contentType": contentType, "uploaderId": currentUserID(r), "workspaceId": workspaceID}))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not store file")
		return
	}
	if limited.N == 0 {
		_ = bucket.Delete(id)
		writeErr(w, http.StatusBadRequest, "file is too large (maximum 25 MB)")
		return
	}
	writeJSON(w, http.StatusCreated, uploadResponse{
		ID: id.Hex(), URL: "/api/files/" + id.Hex(), Name: name,
		Size: header.Size, ContentType: contentType,
	})
}

func safeAttachmentName(raw string) string {
	name := filepath.Base(strings.TrimSpace(raw))
	name = strings.Map(func(char rune) rune {
		if char < 32 || char == 127 || char == '\\' || char == '/' {
			return -1
		}
		return char
	}, name)
	name = strings.Trim(name, " .")
	ext := filepath.Ext(name)
	base := strings.TrimSuffix(name, ext)
	if len([]rune(ext)) > 16 {
		ext = ""
	}
	if len([]rune(base)) > 100 {
		base = string([]rune(base)[:100])
	}
	name = strings.Trim(base, " .") + ext
	if name == "" || name == "." {
		return "attachment"
	}
	return name
}

func (s *Server) downloadFile(w http.ResponseWriter, r *http.Request) {
	id, err := primitive.ObjectIDFromHex(chiURLParam(r, "fileID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid file id")
		return
	}
	bucket, err := gridfs.NewBucket(s.store.DB, options.GridFSBucket().SetName("uploads"))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not open file storage")
		return
	}
	stream, err := bucket.OpenDownloadStream(id)
	if err != nil {
		writeErr(w, http.StatusNotFound, "file not found")
		return
	}
	defer stream.Close()
	meta := stream.GetFile()
	contentType := "application/octet-stream"
	if len(meta.Metadata) > 0 {
		var data struct {
			ContentType string `bson:"contentType"`
		}
		if bson.Unmarshal(meta.Metadata, &data) == nil && data.ContentType != "" {
			contentType = data.ContentType
		}
	}
	if contentType == "application/octet-stream" {
		if detected := mime.TypeByExtension(filepath.Ext(meta.Name)); detected != "" {
			contentType = detected
		}
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Length", strconv.FormatInt(meta.Length, 10))
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "sandbox")
	w.Header().Set("Content-Disposition", "inline; filename=\""+strings.ReplaceAll(safeAttachmentName(meta.Name), "\"", "")+"\"")
	w.Header().Set("Last-Modified", meta.UploadDate.UTC().Format(http.TimeFormat))
	_, _ = io.Copy(w, stream)
}
