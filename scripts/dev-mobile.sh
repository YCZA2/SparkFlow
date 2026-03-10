#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
MOBILE_DIR="${ROOT_DIR}/mobile"
POSTGRES_SCRIPT="${ROOT_DIR}/scripts/postgres-local.sh"

BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
EXPO_PORT="${EXPO_PORT:-8081}"
IOS_PLATFORM="${IOS_PLATFORM:-ios}"

MODE="${1:-start}"
BACKEND_PID=""
EXPO_PID=""
BACKEND_PYTHON=""

print_usage() {
  cat <<'USAGE'
用法：
  bash scripts/dev-mobile.sh           # 模式1：启动前后端联调（默认，LAN 模式）
  bash scripts/dev-mobile.sh start     # 模式1：启动前后端联调（LAN 模式）
  bash scripts/dev-mobile.sh simulator # 模式3：启动前后端联调（iOS Simulator）
  bash scripts/dev-mobile.sh build     # 模式2：执行 iOS 重建，不启动前后端
  bash scripts/dev-mobile.sh help      # 查看帮助

说明：
  模式1 适合：只改 JS / TS / 样式 / 页面逻辑，LAN 模式便于真机测试。
  模式3 适合：只改 JS / TS / 样式 / 页面逻辑，使用本地 iOS Simulator 调试。
  模式2 适合：改了原生配置、插件、Pod、Info.plist、AppDelegate 后，需要重新 Build。
  执行完模式2后，再执行模式1或模式3即可开始联调。
USAGE
}

get_local_ip() {
  local iface ip

  iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}' || true)"
  if [[ -n "${iface:-}" ]]; then
    ip="$(ipconfig getifaddr "${iface}" 2>/dev/null || true)"
    if [[ -n "${ip:-}" ]]; then
      echo "${ip}"
      return
    fi
  fi

  ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
  if [[ -n "${ip:-}" ]]; then
    echo "${ip}"
    return
  fi

  ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
  if [[ -n "${ip:-}" ]]; then
    echo "${ip}"
    return
  fi

  echo "127.0.0.1"
}

cleanup() {
  trap - EXIT INT TERM

  if [[ -n "${EXPO_PID}" || -n "${BACKEND_PID}" ]]; then
    echo
    echo "[dev-mobile] stopping processes..."
  fi

  if [[ -n "${EXPO_PID}" ]]; then
    kill "${EXPO_PID}" 2>/dev/null || true
  fi
  if [[ -n "${BACKEND_PID}" ]]; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi
}

ensure_workspace() {
  if [[ ! -d "${BACKEND_DIR}" || ! -d "${MOBILE_DIR}" ]]; then
    echo "[dev-mobile] backend/ or mobile/ directory not found."
    exit 1
  fi
}

ensure_node_tools() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "[dev-mobile] npm not found. Please install Node.js first."
    exit 1
  fi

  if ! command -v npx >/dev/null 2>&1; then
    echo "[dev-mobile] npx not found. Please install Node.js first."
    exit 1
  fi
}

ensure_backend_python() {
  if [[ -x "${BACKEND_DIR}/.venv/bin/python" ]]; then
    BACKEND_PYTHON="${BACKEND_DIR}/.venv/bin/python"
  else
    BACKEND_PYTHON="python3"
  fi

  if ! command -v "${BACKEND_PYTHON}" >/dev/null 2>&1; then
    echo "[dev-mobile] python not found: ${BACKEND_PYTHON}"
    exit 1
  fi
}

ensure_start_mode_deps() {
  ensure_workspace
  ensure_node_tools
  ensure_backend_python

  if ! command -v curl >/dev/null 2>&1; then
    echo "[dev-mobile] curl not found."
    exit 1
  fi
}

ensure_local_postgres() {
  # 联调默认确保本地 Docker PostgreSQL 可用，除非数据库连接被显式覆盖。
  if [[ ! -f "${POSTGRES_SCRIPT}" ]]; then
    echo "[dev-mobile] postgres helper not found: ${POSTGRES_SCRIPT}"
    exit 1
  fi
  bash "${POSTGRES_SCRIPT}" start dev
}

wait_for_http_ready() {
  # 轮询本地 HTTP 地址，避免后续自动打开客户端时 Metro 尚未就绪。
  local url="$1"
  local label="$2"
  local retries="${3:-30}"

  for _ in $(seq 1 "${retries}"); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "[dev-mobile] ${label} not ready: ${url}"
  return 1
}

ensure_booted_simulator() {
  # 显式确保 iOS 模拟器已启动，避免 Expo 自动 openurl 时命中超时。
  if ! xcrun simctl list devices booted | grep -q "Booted"; then
    echo "[dev-mobile] booting iOS Simulator..."
    open -a Simulator >/dev/null 2>&1 || true
    xcrun simctl boot "iPhone 17 Pro" >/dev/null 2>&1 || true
  fi

  for _ in $(seq 1 20); do
    if xcrun simctl list devices booted | grep -q "Booted"; then
      return 0
    fi
    sleep 1
  done

  echo "[dev-mobile] no booted iOS Simulator detected."
  echo "[dev-mobile] please open Simulator.app and rerun this command."
  return 1
}

open_expo_in_simulator() {
  # 手动打开 dev client，并对 deep link 做重试，规避 Expo CLI 偶发超时。
  local bundle_id="com.sparkflow.mobile"
  local deep_link="exp+sparkflow-mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${EXPO_PORT}"

  if ! xcrun simctl listapps booted | grep -q "\"${bundle_id}\""; then
    echo "[dev-mobile] iOS dev client is not installed on the booted simulator."
    echo "[dev-mobile] run 'bash scripts/dev-mobile.sh build' first."
    return 1
  fi

  xcrun simctl launch booted "${bundle_id}" >/dev/null 2>&1 || true
  sleep 2

  for _ in $(seq 1 3); do
    if xcrun simctl openurl booted "${deep_link}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  echo "[dev-mobile] failed to open Expo dev client via simulator deep link."
  echo "[dev-mobile] open the installed SparkFlow-mobile app manually and retry."
  return 1
}

run_backend_migrations() {
  local alembic_cmd=()

  if [[ -x "${BACKEND_DIR}/.venv/bin/alembic" ]]; then
    alembic_cmd=("${BACKEND_DIR}/.venv/bin/alembic")
  else
    alembic_cmd=("${BACKEND_PYTHON}" "-m" "alembic")
  fi

  echo "[dev-mobile] applying backend migrations..."
  (
    cd "${BACKEND_DIR}"
    "${alembic_cmd[@]}" upgrade head
  )
}

ensure_build_mode_deps() {
  ensure_workspace
  ensure_node_tools
}

free_port() {
  local port="$1"
  local label="$2"
  local pids pid

  if ! command -v lsof >/dev/null 2>&1; then
    echo "[dev-mobile] lsof not found, skip releasing ${label} port ${port}."
    return
  fi

  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "${pids}" ]]; then
    return
  fi

  echo "[dev-mobile] releasing ${label} port ${port}..."
  for pid in ${pids}; do
    kill "${pid}" 2>/dev/null || true
  done

  for _ in $(seq 1 10); do
    if ! lsof -tiTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "[dev-mobile] force killing ${label} port ${port}..."
    for pid in ${pids}; do
      kill -9 "${pid}" 2>/dev/null || true
    done
  fi
}

run_start_mode() {
  local local_ip public_backend_url local_backend_health_url backend_ready

  trap cleanup EXIT INT TERM

  local_ip="$(get_local_ip)"
  public_backend_url="http://${local_ip}:${BACKEND_PORT}"
  local_backend_health_url="http://127.0.0.1:${BACKEND_PORT}/health"

  echo "[dev-mobile] mode1: starting backend + expo..."
  free_port "${BACKEND_PORT}" "backend"
  free_port "${EXPO_PORT}" "expo"

  ensure_local_postgres
  run_backend_migrations

  echo "[dev-mobile] starting backend..."
  (
    cd "${BACKEND_DIR}"
    exec "${BACKEND_PYTHON}" -m uvicorn main:app --host "${BACKEND_HOST}" --port "${BACKEND_PORT}" --reload
  ) &
  BACKEND_PID=$!

  echo "[dev-mobile] waiting backend readiness check: HEAD ${local_backend_health_url}"
  backend_ready=0
  for _ in $(seq 1 30); do
    # 开发启动只需要确认 FastAPI 已监听端口，避免 GET /health 触发外部依赖深度探活。
    if curl -fsSI "${local_backend_health_url}" >/dev/null 2>&1; then
      backend_ready=1
      break
    fi
    sleep 1
  done

  if [[ "${backend_ready}" -ne 1 ]]; then
    echo "[dev-mobile] backend readiness check timeout, but continue to start expo."
  fi

  echo "[dev-mobile] starting expo (LAN mode)..."
  (
    cd "${MOBILE_DIR}"
    exec npx expo start --lan --port "${EXPO_PORT}"
  ) &
  EXPO_PID=$!

  echo
  echo "========================================"
  echo "SparkFlow mobile mode1 is ready"
  echo "Backend API (app network settings): ${public_backend_url}"
  echo "Backend health: ${local_backend_health_url}"
  echo "Metro / Expo bundler: http://${local_ip}:${EXPO_PORT}"
  echo "Tip 1: app 内网络设置填 8000，不要填 8081"
  echo "Tip 2: 真机打开项目请扫 Expo 二维码"
  echo "Press Ctrl+C to stop backend and expo."
  echo "========================================"
  echo

  wait "${EXPO_PID}"
}

run_simulator_mode() {
  local local_ip public_backend_url local_backend_health_url backend_ready metro_ready

  trap cleanup EXIT INT TERM

  local_ip="127.0.0.1"
  public_backend_url="http://${local_ip}:${BACKEND_PORT}"
  local_backend_health_url="http://127.0.0.1:${BACKEND_PORT}/health"

  echo "[dev-mobile] mode3: starting backend + expo (iOS Simulator)..."
  free_port "${BACKEND_PORT}" "backend"
  free_port "${EXPO_PORT}" "expo"

  ensure_local_postgres
  run_backend_migrations

  echo "[dev-mobile] starting backend..."
  (
    cd "${BACKEND_DIR}"
    exec "${BACKEND_PYTHON}" -m uvicorn main:app --host "${BACKEND_HOST}" --port "${BACKEND_PORT}" --reload
  ) &
  BACKEND_PID=$!

  echo "[dev-mobile] waiting backend readiness check: HEAD ${local_backend_health_url}"
  backend_ready=0
  for _ in $(seq 1 30); do
    # 开发启动只需要确认 FastAPI 已监听端口，避免 GET /health 触发外部依赖深度探活。
    if curl -fsSI "${local_backend_health_url}" >/dev/null 2>&1; then
      backend_ready=1
      break
    fi
    sleep 1
  done

  if [[ "${backend_ready}" -ne 1 ]]; then
    echo "[dev-mobile] backend readiness check timeout, but continue to start expo."
  fi

  ensure_booted_simulator

  echo "[dev-mobile] starting expo (iOS Simulator)..."
  (
    cd "${MOBILE_DIR}"
    exec npx expo start --localhost --dev-client --port "${EXPO_PORT}"
  ) &
  EXPO_PID=$!

  metro_ready=0
  if wait_for_http_ready "http://127.0.0.1:${EXPO_PORT}" "expo metro" 45; then
    metro_ready=1
  fi

  if [[ "${metro_ready}" -eq 1 ]]; then
    open_expo_in_simulator || true
  else
    echo "[dev-mobile] skip auto-opening simulator because metro is not ready yet."
  fi

  echo
  echo "========================================"
  echo "SparkFlow mobile mode3 is ready"
  echo "Backend API: ${public_backend_url}"
  echo "Backend health: ${local_backend_health_url}"
  echo "Tip: app 内网络设置填 127.0.0.1:8000"
  echo "Press Ctrl+C to stop backend and expo."
  echo "========================================"
  echo

  wait "${EXPO_PID}"
}

run_build_mode() {
  echo "[dev-mobile] mode2: rebuilding iOS app only..."
  echo "[dev-mobile] this mode does not start backend or expo."

  cd "${MOBILE_DIR}"

  echo "[dev-mobile] step 1/4: npm install"
  npm install

  echo "[dev-mobile] step 2/4: expo prebuild --platform ${IOS_PLATFORM} --clean"
  npx expo prebuild --platform "${IOS_PLATFORM}" --clean

  echo "[dev-mobile] step 3/4: pod-install ios"
  npx pod-install ios

  echo "[dev-mobile] step 4/4: expo run:ios --device"
  npx expo run:ios --device

  echo
  echo "========================================"
  echo "Mode2 build finished."
  echo "Next step: run 'bash scripts/dev-mobile.sh'"
  echo "That will start backend + expo for daily development."
  echo "========================================"
}

case "${MODE}" in
  start)
    ensure_start_mode_deps
    run_start_mode
    ;;
  simulator)
    ensure_start_mode_deps
    run_simulator_mode
    ;;
  build)
    ensure_build_mode_deps
    run_build_mode
    ;;
  help|-h|--help)
    ensure_workspace
    print_usage
    ;;
  *)
    echo "[dev-mobile] unknown mode: ${MODE}"
    echo
    print_usage
    exit 1
    ;;
esac
