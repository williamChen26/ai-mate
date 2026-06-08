#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT_DIR"

# 读取本地环境变量。不要把真实 key 提交到仓库；推荐放在 .env.local。
if [[ -f ".env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env"
  set +a
fi

if [[ -f ".env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source ".env.local"
  set +a
fi

SERVER_HOST="${SERVER_HOST:-127.0.0.1}"
SERVER_PORT="${SERVER_PORT:-3001}"
WEB_HOST="${WEB_HOST:-127.0.0.1}"
WEB_PORT="${WEB_PORT:-3000}"

# 端口检查只做提醒和阻断，避免一键启动时悄悄复用错服务。
check_port() {
  local port="$1"
  local label="$2"
  if command -v lsof >/dev/null 2>&1 &&
    lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    echo "Port $port is already in use by another process ($label)." >&2
    echo "Stop that process first, or rerun with ${label}_PORT=<free-port>." >&2
    exit 1
  fi
}

if [[ -z "${DEEPSEEK_API_KEY:-}" ]]; then
  echo "DEEPSEEK_API_KEY is required for real AI mode." >&2
  echo "Set it in your shell or create .env.local with:" >&2
  echo "DEEPSEEK_API_KEY=your_key" >&2
  exit 1
fi

check_port "$SERVER_PORT" "SERVER"
check_port "$WEB_PORT" "WEB"

cleanup() {
  echo
  echo "Stopping real AI dev services..."
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
  if [[ -n "${WEB_PID:-}" ]]; then
    kill "$WEB_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

echo "Starting real AI server on http://${SERVER_HOST}:${SERVER_PORT}"
MATE_AGENT_MODE=real \
  DEEPSEEK_API_KEY="$DEEPSEEK_API_KEY" \
  HOST="$SERVER_HOST" \
  PORT="$SERVER_PORT" \
  pnpm --filter @production-spec-graph/server dev &
SERVER_PID=$!

echo "Starting web app on http://${WEB_HOST}:${WEB_PORT}"
NEXT_PUBLIC_PSG_SYNC_SERVER_URL="http://${SERVER_HOST}:${SERVER_PORT}" \
  pnpm --filter @production-spec-graph/web exec next dev \
    --hostname "$WEB_HOST" \
    --port "$WEB_PORT" &
WEB_PID=$!

cat <<EOF

Real AI dev is starting.

Open:
  http://${WEB_HOST}:${WEB_PORT}/rooms/test-ai

Diagnostics:
  http://${SERVER_HOST}:${SERVER_PORT}/rooms/test-ai/diagnostics

Press Ctrl-C to stop both services.
EOF

# 任一服务退出都停掉另一个，避免留下半启动的 dev 环境。
while true; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Server process exited."
    exit 1
  fi
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    echo "Web process exited."
    exit 1
  fi
  sleep 1
done
