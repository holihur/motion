#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Prefer an explicitly provided browser. In sandboxed environments we may only
# have Playwright's headless shell cached rather than the full Chromium build.
if [[ -z "${CHROMIUM_PATH:-}" ]]; then
  CACHED="$(find "${HOME}/.cache/ms-playwright" -type f -name chrome-headless-shell 2>/dev/null | head -n 1 || true)"
  if [[ -n "${CACHED}" ]]; then
    export CHROMIUM_PATH="${CACHED}"
  fi
fi

exec mise exec -- pnpm exec playwright test "$@"
