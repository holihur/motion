# syntax=docker/dockerfile:1
FROM debian:bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git libatomic1 \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://mise.run | sh
ENV PATH="/root/.local/bin:${PATH}" MISE_YES=1

WORKDIR /app
COPY mise.toml ./
RUN mise trust && mise install

COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./web/
RUN cd web && mise exec -- pnpm install --frozen-lockfile
COPY web/ ./web/
RUN cd web && mise exec -- pnpm build

COPY server/ ./server/
RUN cp -R web/dist/. server/internal/webassets/dist/
ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_DATE=unknown
RUN cd server && CGO_ENABLED=0 mise exec -- go build -tags embedweb -trimpath \
    -ldflags "-s -w -X github.com/motion/server/internal/version.Version=${VERSION} -X github.com/motion/server/internal/version.Commit=${COMMIT} -X github.com/motion/server/internal/version.Date=${BUILD_DATE}" \
    -o /out/motion ./cmd/server

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S motion && adduser -S -G motion motion
COPY --from=build /out/motion /usr/local/bin/motion
USER motion
ENV PORT=8787 SEED_DEMO=false
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
ENTRYPOINT ["motion"]
