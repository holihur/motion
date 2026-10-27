SHELL := /bin/bash
MISE ?= mise
MISE_EXEC := $(MISE) exec --
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
BUILD_DATE ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -s -w \
	-X github.com/motion/server/internal/version.Version=$(VERSION) \
	-X github.com/motion/server/internal/version.Commit=$(COMMIT) \
	-X github.com/motion/server/internal/version.Date=$(BUILD_DATE)

.PHONY: help install deps typecheck build-web build-web-fast embed embed-fast build build-fast build-api dev dev-watch dev-hmr dev-api dev-web test e2e clean docker

help:
	@echo "Motion targets:"
	@echo "  make install    Install mise toolchains and frontend/e2e dependencies"
	@echo "  make build      Build a single production binary with embedded frontend"
	@echo "  make build-fast Build embedded binary without asset precompression (local)"
	@echo "  make build-api  Build only the Go API, serving web/dist from disk"
	@echo "  make dev        Build frontend + API, then serve with Go (no Vite process)"
	@echo "  make dev-watch  Go API + Vite build watch (low memory auto rebuild)"
	@echo "  make dev-hmr    API + Vite dev server (HMR, needs more RAM)"
	@echo "  make dev-api    Run the Go API (uses ./web/dist when present)"
	@echo "  make dev-web    Run the Vite dev server"
	@echo "  make typecheck  Type-check the frontend"
	@echo "  make test       Go tests + frontend type-check"
	@echo "  make e2e        Build and run the Playwright suite (E2E_ARGS=tests/x.spec.ts)"
	@echo "  make docker     Build the production container image"

install: deps

deps:
	$(MISE) install
	cd web && $(MISE_EXEC) pnpm install --frozen-lockfile
	cd e2e && $(MISE_EXEC) pnpm install --frozen-lockfile

typecheck:
	cd web && $(MISE_EXEC) pnpm typecheck

build-web:
	cd web && $(MISE_EXEC) pnpm build

build-web-fast:
	cd web && $(MISE_EXEC) pnpm build:fast

embed: build-web
	rm -rf server/internal/webassets/dist
	mkdir -p server/internal/webassets/dist
	cp -R web/dist/. server/internal/webassets/dist/

build: embed
	cd server && CGO_ENABLED=0 $(MISE_EXEC) go build -tags embedweb -trimpath -ldflags "$(LDFLAGS)" -o bin/motion ./cmd/server
	@echo "Built server/bin/motion ($(VERSION)) — frontend embedded"

embed-fast: build-web-fast
	rm -rf server/internal/webassets/dist
	mkdir -p server/internal/webassets/dist
	cp -R web/dist/. server/internal/webassets/dist/

build-fast: embed-fast
	cd server && CGO_ENABLED=0 $(MISE_EXEC) go build -tags embedweb -ldflags "$(LDFLAGS)" -o bin/motion ./cmd/server
	@echo "Built server/bin/motion ($(VERSION)) — fast local build"

build-api:
	cd server && $(MISE_EXEC) go build -o bin/motion-api ./cmd/server

dev: build-web-fast build-api
	bash scripts/dev-go.sh

dev-watch: build-api
	bash scripts/dev.sh watch

dev-hmr: build-api
	bash scripts/dev.sh hmr

dev-api:
	cd server && $(MISE_EXEC) go run ./cmd/server

dev-web:
	cd web && $(MISE_EXEC) pnpm dev

test:
	cd server && $(MISE_EXEC) go test ./...
	cd web && $(MISE_EXEC) pnpm typecheck

e2e: build-web-fast build-api
	cd e2e && $(MISE_EXEC) pnpm test $(E2E_ARGS)

clean:
	rm -rf web/dist web/public/vendor server/bin server/internal/webassets/dist e2e/test-results e2e/playwright-report

docker:
	docker build -t motion:local .
