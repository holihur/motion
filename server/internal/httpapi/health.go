package httpapi

import (
	"context"
	"net/http"
	"time"

	"github.com/motion/server/internal/version"
)

func (s *Server) livez(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) readyz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.store.Client.Ping(ctx, nil); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unavailable", "mongo": "error"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "mongo": "ok"})
}

func (s *Server) healthz(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	status := "ok"
	code := http.StatusOK
	mongoStatus := "ok"
	if err := s.store.Client.Ping(ctx, nil); err != nil {
		status = "degraded"
		mongoStatus = "error"
		code = http.StatusServiceUnavailable
	}
	writeJSON(w, code, map[string]string{
		"status": status, "mongo": mongoStatus, "version": version.Version,
	})
}
