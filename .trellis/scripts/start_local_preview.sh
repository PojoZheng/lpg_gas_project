#!/usr/bin/env bash
# Start backend (3100) + static frontend (5174) so product URLs in handoff are reachable.
# Idempotent: if ports already respond, skips starting that service.
#
# Usage (from repo root):
#   bash ./.trellis/scripts/start_local_preview.sh
#   bash ./.trellis/scripts/start_local_preview.sh --check-only
#
# Stop (optional):
#   kill "$(cat /tmp/lpg-gas-backend.pid 2>/dev/null)" 2>/dev/null
#   kill "$(cat /tmp/lpg-gas-frontend.pid 2>/dev/null)" 2>/dev/null

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/.trellis/backend"
FRONTEND_DIR="$REPO_ROOT/.trellis/delivery-app/src"
PLATFORM_DIR="$REPO_ROOT/.trellis/platform/src"
BACKEND_PORT=3100
FRONTEND_PORT=5174
PLATFORM_PORT=5175
PID_BACKEND="/tmp/lpg-gas-backend.pid"
PID_FRONTEND="/tmp/lpg-gas-frontend.pid"
PID_PLATFORM="/tmp/lpg-gas-platform.pid"
LOG_BACKEND="/tmp/lpg-gas-backend.log"
LOG_FRONTEND="/tmp/lpg-gas-frontend.log"
LOG_PLATFORM="/tmp/lpg-gas-platform.log"

CHECK_ONLY=false
if [[ "${1:-}" == "--check-only" ]]; then
  CHECK_ONLY=true
fi

backend_up() {
  curl -sf -X OPTIONS "http://127.0.0.1:${BACKEND_PORT}/" >/dev/null 2>&1
}

frontend_up() {
  curl -sf -o /dev/null "http://127.0.0.1:${FRONTEND_PORT}/workbench.html" 2>/dev/null
}

platform_up() {
  curl -sf -o /dev/null "http://127.0.0.1:${PLATFORM_PORT}/index.html" 2>/dev/null
}
if ! "$CHECK_ONLY"; then
  echo "[preview] repo: $REPO_ROOT"
fi

if backend_up; then
  echo "[preview] backend already listening on ${BACKEND_PORT}"
else
  if "$CHECK_ONLY"; then
    echo "[preview] ERROR: backend not up on ${BACKEND_PORT}. Run without --check-only." >&2
    exit 1
  fi
  echo "[preview] starting backend (node) -> ${LOG_BACKEND}"
  (cd "$BACKEND_DIR" && nohup node src/server.js >>"$LOG_BACKEND" 2>&1 & echo $! >"$PID_BACKEND")
  for _ in $(seq 1 20); do
    if backend_up; then break; fi
    sleep 0.2
  done
  if ! backend_up; then
    echo "[preview] ERROR: backend failed to become ready. See ${LOG_BACKEND}" >&2
    exit 1
  fi
  echo "[preview] backend OK (pid $(cat "$PID_BACKEND"))"
fi

if frontend_up; then
  echo "[preview] frontend already serving on ${FRONTEND_PORT}"
else
  if "$CHECK_ONLY"; then
    echo "[preview] ERROR: frontend not up on ${FRONTEND_PORT}. Run without --check-only." >&2
    exit 1
  fi
  echo "[preview] starting static server -> ${LOG_FRONTEND}"
  (cd "$FRONTEND_DIR" && nohup python3 -m http.server "$FRONTEND_PORT" >>"$LOG_FRONTEND" 2>&1 & echo $! >"$PID_FRONTEND")
  for _ in $(seq 1 20); do
    if frontend_up; then break; fi
    sleep 0.2
  done
  if ! frontend_up; then
    echo "[preview] ERROR: frontend failed to become ready. See ${LOG_FRONTEND}" >&2
    exit 1
  fi
  echo "[preview] frontend OK (pid $(cat "$PID_FRONTEND"))"
fi

if [[ -d "$PLATFORM_DIR" ]]; then
  if platform_up; then
    echo "[preview] platform frontend already serving on ${PLATFORM_PORT}"
  else
    if "$CHECK_ONLY"; then
      echo "[preview] ERROR: platform frontend not up on ${PLATFORM_PORT}. Run without --check-only." >&2
      exit 1
    fi
    echo "[preview] starting platform static server -> ${LOG_PLATFORM}"
    (cd "$PLATFORM_DIR" && nohup python3 -m http.server "$PLATFORM_PORT" >>"$LOG_PLATFORM" 2>&1 & echo $! >"$PID_PLATFORM")
    for _ in $(seq 1 20); do
      if platform_up; then break; fi
      sleep 0.2
    done
    if ! platform_up; then
      echo "[preview] ERROR: platform frontend failed to become ready. See ${LOG_PLATFORM}" >&2
      exit 1
    fi
    echo "[preview] platform frontend OK (pid $(cat "$PID_PLATFORM"))"
  fi
else
  echo "[preview] platform frontend dir not found: ${PLATFORM_DIR} (waiting task-25 integration)"
fi

echo ""
echo "[preview] Open these in browser (backend + static both required for full flow):"
echo "  [app] http://127.0.0.1:${FRONTEND_PORT}/workbench.html"
echo "  [app] http://127.0.0.1:${FRONTEND_PORT}/quick-order.html"
echo "  [app] http://127.0.0.1:${FRONTEND_PORT}/delivery-complete.html"
if [[ -d "$PLATFORM_DIR" ]]; then
  echo "  [platform-main] http://127.0.0.1:${PLATFORM_PORT}/index.html"
  echo "  [platform] http://127.0.0.1:${PLATFORM_PORT}/platform-monitor.html"
  echo "  [platform] http://127.0.0.1:${PLATFORM_PORT}/policy-release.html"
  echo "  [platform] http://127.0.0.1:${PLATFORM_PORT}/sync-queue.html"
else
  echo "  [platform-main] (pending task-25) http://127.0.0.1:${PLATFORM_PORT}/index.html"
fi
echo "  API: http://127.0.0.1:${BACKEND_PORT}/"
echo ""
