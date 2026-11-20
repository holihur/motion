#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Local runs should honour the same .env as docker compose.
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [[ ! -f web/dist/index.html ]]; then
  echo "web/dist is missing. Run 'make build-web-fast' first." >&2
  exit 1
fi
if [[ ! -x server/bin/motion-api ]]; then
  echo "server/bin/motion-api is missing. Run 'make build-api' first." >&2
  exit 1
fi

export WEB_DIR="$PWD/web/dist"
echo "Motion: http://localhost:${PORT:-8787}"
echo "Frontend: web/dist (Go server, no Vite process)"
exec ./server/bin/motion-api
