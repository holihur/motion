package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/motion/server/internal/auth"
	"github.com/motion/server/internal/config"
	"github.com/motion/server/internal/httpapi"
	"github.com/motion/server/internal/seed"
	"github.com/motion/server/internal/store"
	"github.com/motion/server/internal/update"
	"github.com/motion/server/internal/version"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))
	cfg := config.Load()
	cfg.Validate()

	for _, arg := range os.Args[1:] {
		if arg == "-version" || arg == "--version" || arg == "version" {
			fmt.Printf("motion %s (commit %s, built %s)\n", version.Version, version.Commit, version.Date)
			return
		}
	}
	if len(os.Args) > 1 && os.Args[1] == "update" {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		client := update.New(cfg.UpdateRepo, cfg.GitHubToken)
		tag, err := client.Apply(ctx)
		if err != nil {
			fmt.Fprintln(os.Stderr, "update failed:", err)
			os.Exit(1)
		}
		fmt.Printf("updated to %s — restart Motion to use it\n", tag)
		return
	}

	ctx := context.Background()
	st, err := connectWithRetry(ctx, cfg.MongoURI, cfg.MongoDB)
	if err != nil {
		slog.Error("could not connect to MongoDB", "error", err)
		os.Exit(1)
	}
	defer func() {
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := st.Close(shutdown); err != nil {
			slog.Error("close mongo", "error", err)
		}
	}()

	if err := st.EnsureIndexes(ctx); err != nil {
		slog.Error("could not create indexes", "error", err)
		os.Exit(1)
	}
	if cfg.SeedDemo {
		seedCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		if err := seed.SeedDemo(seedCtx, st); err != nil {
			slog.Warn("demo seed skipped", "error", err)
		} else {
			slog.Info("demo account ready", "email", "demo@motion.app")
		}
		cancel()
	}

	tokens := auth.NewManager(cfg.JWTSecret, cfg.TokenTTL)
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM, syscall.SIGHUP)
	api := httpapi.New(cfg, st, tokens)
	api.SetRestart(func() {
		select {
		case stop <- syscall.SIGTERM:
		default:
		}
	})
	api.StartAutoUpdate(ctx)
	api.StartTrashRetention(ctx)
	api.StartAgentScheduler(ctx)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           api.Router(),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		slog.Info("motion api listening", "addr", srv.Addr, "version", version.Version)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server stopped", "error", err)
			os.Exit(1)
		}
	}()

	received := <-stop
	if received == syscall.SIGHUP {
		slog.Info("reloading is not required; configuration is live")
	} else {
		slog.Info("shutdown requested", "signal", received.String())
	}

	shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdown); err != nil {
		slog.Error("graceful shutdown failed", "error", err)
	}
	slog.Info("motion api stopped")
}

func connectWithRetry(ctx context.Context, uri, db string) (*store.Store, error) {
	var lastErr error
	for attempt := 1; attempt <= 10; attempt++ {
		st, err := store.Connect(ctx, uri, db)
		if err == nil {
			return st, nil
		}
		lastErr = err
		slog.Warn("mongo not ready, retrying", "attempt", attempt, "error", err)
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(time.Duration(attempt) * time.Second):
		}
	}
	return nil, lastErr
}
