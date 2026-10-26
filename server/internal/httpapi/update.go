package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/motion/server/internal/site"
	"github.com/motion/server/internal/update"
	"github.com/motion/server/internal/version"
)

func (s *Server) systemInfo(w http.ResponseWriter, _ *http.Request) {
	s.updateMu.Lock()
	last := s.lastUpdate
	checkedAt := s.lastUpdateAt
	s.updateMu.Unlock()
	if last.Version == "" {
		last = update.Check{Version: version.Version, Commit: version.Commit, Date: version.Date}
	}
	var checked any
	if !checkedAt.IsZero() {
		checked = checkedAt
	}
	settings := s.siteSnapshot()
	writeJSON(w, http.StatusOK, map[string]any{
		"version":     version.Version,
		"commit":      version.Commit,
		"buildDate":   version.Date,
		"appName":     settings.AppName,
		"repo":        settings.Update.Repo,
		"checkedAt":   checked,
		"latest":      last.Latest,
		"available":   last.Available,
		"releaseUrl":  last.ReleaseURL,
		"publishedAt": last.PublishedAt,
	})
}

func (s *Server) updateCheck(ctx context.Context, settings site.Settings) update.Check {
	repo := strings.TrimSpace(settings.Update.Repo)
	client := update.New(repo, s.cfg.GitHubToken)
	check := client.Check(ctx)
	s.updateMu.Lock()
	s.lastUpdate = check
	s.lastUpdateAt = time.Now().UTC()
	s.updateMu.Unlock()
	return check
}

func (s *Server) checkUpdate(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	settings := s.siteSnapshot()
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	check := s.updateCheck(ctx, settings)
	writeJSON(w, http.StatusOK, check)
}

func (s *Server) applyUpdate(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requireAdmin(w, r); !ok {
		return
	}
	settings := s.siteSnapshot()
	ctx, cancel := context.WithTimeout(r.Context(), 120*time.Second)
	defer cancel()
	client := update.New(strings.TrimSpace(settings.Update.Repo), s.cfg.GitHubToken)
	tag, err := client.Apply(ctx)
	if err != nil {
		writeErr(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"updated": true, "version": tag, "restarting": s.restart != nil,
	})
	if s.restart != nil {
		go func() {
			time.Sleep(1200 * time.Millisecond)
			s.restart()
		}()
	}
}

// SetRestart registers the callback used after a self-update replaces the binary.
func (s *Server) SetRestart(restart func()) {
	s.restart = restart
}

// StartAutoUpdate runs the background update policy configured in Ops. It is a
// no-op when updates are disabled.
func (s *Server) StartAutoUpdate(ctx context.Context) {
	go func() {
		timer := time.NewTimer(90 * time.Second)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
			}
			settings := s.siteSnapshot()
			mode := settings.Update.Mode
			interval := time.Duration(max(settings.Update.IntervalHours, 1)) * time.Hour
			s.updateMu.Lock()
			last := s.lastUpdateAt
			s.updateMu.Unlock()
			if mode == "off" || time.Since(last) < interval {
				timer.Reset(15 * time.Minute)
				continue
			}
			checkCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
			check := s.updateCheck(checkCtx, settings)
			cancel()
			if check.Error != "" {
				slog.Warn("auto update check failed", "error", check.Error)
			} else if check.Available {
				slog.Info("update available", "version", check.Latest, "current", version.Version)
				if mode == "apply" {
					applyCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
					client := update.New(strings.TrimSpace(settings.Update.Repo), s.cfg.GitHubToken)
					tag, err := client.Apply(applyCtx)
					cancel()
					if err != nil {
						slog.Error("auto update failed", "error", err)
					} else {
						slog.Info("auto update applied", "version", tag, "restart", s.restart != nil)
						if s.restart != nil {
							go func() {
								time.Sleep(2 * time.Second)
								s.restart()
							}()
							return
						}
					}
				}
			}
			timer.Reset(15 * time.Minute)
		}
	}()
}
