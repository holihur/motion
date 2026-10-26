SHELL := /bin/bash
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
BUILD_DATE ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -s -w \
	-X github.com/motion/server/internal/version.Version=$(VERSION) \
	-X github.com/motion/server/internal/version.Commit=$(COMMIT) \
	-X github.com/motion/server/internal/version.Date=$(BUILD_DATE)

.PHONY: help install typecheck build-web embed build build-api dev-api dev-web test e2e clean docker

help:
	@echo "Motion targets:"
	@echo "  make install    Install frontend and e2e dependencies"
	@echo "  make build      Build a single production binary with embedded frontend"
	@echo "  make dev-api    Run the Go API (uses ./web/dist when present)"
	@echo "  make dev-web    Run the Vite dev server"
	@echo "  make typecheck  Type-check the frontend"
	@echo "  make test       Go tests + frontend type-check"
	@echo "  make e2e        Build and run the Playwright suite"
	@echo "  make docker     Build the production container image"

install:
	cd web && pnpm install --frozen-lockfile
	cd e2e && pnpm install --frozen-lockfile

typecheck:
	cd web && pnpm typecheck

build-web:
	cd web && pnpm install --frozen-lockfile
	cd web && pnpm build

embed: build-web
	rm -rf server/internal/webassets/dist
	mkdir -p server/internal/webassets/dist
	cp -R web/dist/. server/internal/webassets/dist/

build: embed
	cd server && CGO_ENABLED=0 go build -tags embedweb -trimpath -ldflags "$(LDFLAGS)" -o bin/motion ./cmd/server
	@echo "Built server/bin/motion ($(VERSION)) — frontend embedded"

build-api:
	cd server && go build -o bin/motion-api ./cmd/server

dev-api:
	cd server && go run ./cmd/server

dev-web:
	cd web && pnpm dev

test:
	cd server && go test ./...
	cd web && pnpm typecheck

e2e: build-web build-api
	cd e2e && pnpm install --frozen-lockfile
	cd e2e && pnpm test

clean:
	rm -rf web/dist web/public/vendor server/bin server/internal/webassets/dist e2e/test-results e2e/playwright-report

docker:
	docker build -t motion:local .
