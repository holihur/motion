#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

MODE="${1:-watch}"
export WEB_DIR="${WEB_DIR:-$PWD/web/dist}"
export MOTION_DEV_API_PORT="${PORT:-8787}"

if [[ ! -d "$WEB_DIR" ]]; then
  echo "Warning: $WEB_DIR does not exist; the first frontend build will create it." >&2
fi

cleanup() {
  # Each child is started in its own process group so pnpm/go can be stopped
  # together instead of leaving orphan Vite or Go processes behind.
  for pid in "${web_pid:-}" "${api_pid:-}"; do
    [[ -n "$pid" ]] || continue
    kill -- "-$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup INT TERM EXIT

case "$MODE" in
  watch)
    echo "API:  http://localhost:${MOTION_DEV_API_PORT}"
    echo "Web:  http://localhost:${MOTION_DEV_API_PORT}  (refresh after a rebuild)"
    echo "Mode: vite build --watch (low memory; no HMR)"
    setsid bash -c 'cd web && exec mise exec -- pnpm dev:watch' &
    web_pid=$!
    setsid bash -c 'cd server && exec env WEB_DIR="$WEB_DIR" mise exec -- go run ./cmd/server' &
    api_pid=$!
    ;;
  hmr)
    echo "API:  http://localhost:${MOTION_DEV_API_PORT}"
    echo "Web:  http://localhost:5173  (Vite HMR)"
    echo "Mode: Vite dev server (higher memory)"
    setsid bash -c 'cd web && exec mise exec -- pnpm dev --host 127.0.0.1' &
    web_pid=$!
    setsid bash -c 'cd server && exec env WEB_DIR="$WEB_DIR" mise exec -- go run ./cmd/server' &
    api_pid=$!
    ;;
  *)
    echo "Usage: $0 [watch|hmr]" >&2
    exit 2
    ;;
esac

echo "Press Ctrl+C to stop both."
wait -n "$api_pid" "$web_pid"
