#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export PORT="${E2E_PORT:-8788}"
export MONGODB_DB="${MONGODB_DB:-motion_e2e}"
export WEB_DIR="web/dist"
export SEED_DEMO="false"
export ADMIN_EMAILS="${ADMIN_EMAILS:-e2e-admin@example.com}"

if [[ "${MONGODB_DB}" != *"_e2e" ]]; then
  echo "Refusing to drop database '${MONGODB_DB}' (name must end with _e2e)" >&2
  exit 1
fi

if [[ ! -x "server/bin/motion-api" ]]; then
  echo "server/bin/motion-api is missing. Run 'make build' first." >&2
  exit 1
fi
if [[ ! -f "web/dist/index.html" ]]; then
  echo "web/dist is missing. Run 'make build' first." >&2
  exit 1
fi

if command -v mongosh >/dev/null 2>&1; then
  SEP="?"
  case "${MONGODB_URI}" in *\?*) SEP="&" ;; esac
  mongosh "${MONGODB_URI}/${MONGODB_DB}${SEP}serverSelectionTimeoutMS=15000" --quiet --eval 'db.dropDatabase()' >/dev/null
else
  echo "mongosh not found; assuming the e2e MongoDB already has a fresh database"
fi

exec ./server/bin/motion-api
