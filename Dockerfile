# syntax=docker/dockerfile:1
FROM node:26-alpine AS frontend
RUN npm install -g pnpm@12.15.0
WORKDIR /app/web
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM golang:1.27-alpine AS backend
WORKDIR /src/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
COPY --from=frontend /app/web/dist ./internal/webassets/dist
ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_DATE=unknown
RUN CGO_ENABLED=0 go build -tags embedweb -trimpath \
    -ldflags "-s -w -X github.com/motion/server/internal/version.Version=${VERSION} -X github.com/motion/server/internal/version.Commit=${COMMIT} -X github.com/motion/server/internal/version.Date=${BUILD_DATE}" \
    -o /out/motion ./cmd/server

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S motion && adduser -S -G motion motion
COPY --from=backend /out/motion /usr/local/bin/motion
USER motion
ENV PORT=8787 SEED_DEMO=false
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
ENTRYPOINT ["motion"]
