package httpapi

import (
	"bytes"
	"io/fs"
	"mime"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"net/http"

	"github.com/motion/server/internal/webassets"
)

// resolveWeb finds the frontend. A disk build wins (handy during development),
// then the embedded production assets, then nothing.
func resolveWeb(configured string) (fs.FS, string) {
	candidates := []string{}
	if configured != "" {
		candidates = append(candidates, configured)
	}
	candidates = append(candidates, "web/dist", "../web/dist", "dist")
	for _, dir := range candidates {
		if info, err := os.Stat(filepath.Join(dir, "index.html")); err == nil && !info.IsDir() {
			abs, err := filepath.Abs(dir)
			if err == nil {
				return os.DirFS(abs), abs
			}
			return os.DirFS(dir), dir
		}
	}
	if embedded, ok := webassets.Dir(); ok {
		return embedded, "embedded"
	}
	return nil, ""
}

func (s *Server) serveWeb(w http.ResponseWriter, r *http.Request) {
	if s.webFS == nil {
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			writeErr(w, http.StatusNotFound, "route not found")
			return
		}
		writeErr(w, http.StatusNotFound, "frontend is not built yet — run `pnpm build` in web/")
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		writeErr(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	clean := path.Clean("/" + r.URL.Path)
	name := strings.TrimPrefix(clean, "/")
	if name == "" {
		s.serveAsset(w, r, "index.html")
		return
	}
	info, err := fs.Stat(s.webFS, name)
	if err == nil && !info.IsDir() {
		s.serveAsset(w, r, name)
		return
	}
	if ext := path.Ext(name); ext != "" && ext != ".html" {
		http.NotFound(w, r)
		return
	}
	s.serveAsset(w, r, "index.html")
}

func (s *Server) serveAsset(w http.ResponseWriter, r *http.Request, name string) {
	encoding := ""
	serveName := name
	if strings.Contains(r.Header.Get("Accept-Encoding"), "br") {
		if _, err := fs.Stat(s.webFS, name+".br"); err == nil {
			serveName, encoding = name+".br", "br"
		}
	}
	if encoding == "" && strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		if _, err := fs.Stat(s.webFS, name+".gz"); err == nil {
			serveName, encoding = name+".gz", "gzip"
		}
	}
	data, err := fs.ReadFile(s.webFS, serveName)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	if encoding != "" {
		w.Header().Set("Content-Encoding", encoding)
		w.Header().Set("Vary", "Accept-Encoding")
	}
	if contentType := mime.TypeByExtension(path.Ext(name)); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	switch {
	case strings.HasPrefix(r.URL.Path, "/assets/"):
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	case strings.HasPrefix(r.URL.Path, "/vendor/"):
		w.Header().Set("Cache-Control", "public, max-age=604800")
	default:
		w.Header().Set("Cache-Control", "no-cache")
	}
	http.ServeContent(w, r, name, time.Time{}, bytes.NewReader(data))
}
