#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
MOBILE_DIR="${ROOT_DIR}/mobile"
POSTGRES_SCRIPT="${ROOT_DIR}/scripts/postgres-local.sh"
RABBITMQ_SCRIPT="${ROOT_DIR}/scripts/rabbitmq-local.sh"
CELERY_WORKER_SCRIPT="${ROOT_DIR}/scripts/celery-worker.sh"
CELERY_BEAT_SCRIPT="${ROOT_DIR}/scripts/celery-beat.sh"

BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
EXPO_PORT="${EXPO_PORT:-8081}"
IOS_PLATFORM="${IOS_PLATFORM:-ios}"
APP_ENV="${APP_ENV:-development}"
CELERY_BROKER_URL="${CELERY_BROKER_URL:-amqp://guest:guest@127.0.0.1:5672//}"
CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND:-rpc://}"
CELERY_BEAT_SCHEDULE_FILE="${CELERY_BEAT_SCHEDULE_FILE:-${ROOT_DIR}/backend/runtime/celerybeat-schedule-dev}"
IOS_DEV_BUNDLE_ID="${IOS_DEV_BUNDLE_ID:-com.sparkflow.mobile.dev}"
IOS_DEV_SCHEME="${IOS_DEV_SCHEME:-sparkflowmobiledev}"

MODE="${1:-start}"
BUILD_TARGET_INPUT="${2:-${BUILD_TARGET:-}}"
BACKEND_PID=""
CELERY_WORKER_PID=""
CELERY_BEAT_PID=""
EXPO_PID=""
BACKEND_PYTHON=""

print_usage() {
  cat <<'USAGE'
用法：
  bash scripts/dev-mobile.sh           # 模式1：启动前后端联调（默认，LAN 模式）
  bash scripts/dev-mobile.sh start     # 模式1：启动前后端联调（LAN 模式）
  bash scripts/dev-mobile.sh simulator # 模式3：启动前后端联调（iOS Simulator）
  bash scripts/dev-mobile.sh build     # 模式2：交互选择 iOS 构建目标，不启动前后端
  bash scripts/dev-mobile.sh build simulator  # 模式2：重建并安装到 iOS Simulator
  bash scripts/dev-mobile.sh build device     # 模式2：重建并安装到物理 iPhone
  bash scripts/dev-mobile.sh install   # 模式5：仅安装已有 iOS .app 到设备
  bash scripts/dev-mobile.sh help      # 查看帮助

说明：
  模式1 适合：只改 JS / TS / 样式 / 页面逻辑，LAN 模式便于真机测试。
  模式3 适合：只改 JS / TS / 样式 / 页面逻辑，使用本地 iOS Simulator 调试。
  模式2 适合：改了原生配置、插件、Pod、Info.plist、AppDelegate 后，需要重新 Build。
            不传 target 时会交互选择 simulator 或 device。
  模式5 适合：build 已成功但安装真机失败时，复用已有 .app 仅重试安装。
  执行完模式2或模式5后，再执行模式1或模式3即可开始联调。
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

  if [[ -n "${EXPO_PID}" || -n "${BACKEND_PID}" || -n "${CELERY_WORKER_PID}" || -n "${CELERY_BEAT_PID}" ]]; then
    echo
    echo "[dev-mobile] stopping processes..."
  fi

  if [[ -n "${EXPO_PID}" ]]; then
    kill "${EXPO_PID}" 2>/dev/null || true
  fi
  if [[ -n "${CELERY_BEAT_PID}" ]]; then
    kill "${CELERY_BEAT_PID}" 2>/dev/null || true
  fi
  if [[ -n "${CELERY_WORKER_PID}" ]]; then
    kill "${CELERY_WORKER_PID}" 2>/dev/null || true
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
  # 联调默认确保本机 PostgreSQL 可用，除非数据库连接被显式覆盖。
  if [[ ! -f "${POSTGRES_SCRIPT}" ]]; then
    echo "[dev-mobile] postgres helper not found: ${POSTGRES_SCRIPT}"
    exit 1
  fi
  bash "${POSTGRES_SCRIPT}" start dev
}

ensure_local_rabbitmq() {
  # 真实 Celery 拓扑需要 RabbitMQ 作为跨进程 broker；未安装时提示用户按需安装。
  if [[ ! -f "${RABBITMQ_SCRIPT}" ]]; then
    echo "[dev-mobile] RabbitMQ helper not found: ${RABBITMQ_SCRIPT}"
    exit 1
  fi
  bash "${RABBITMQ_SCRIPT}" start
}

start_celery_worker() {
  if [[ ! -f "${CELERY_WORKER_SCRIPT}" ]]; then
    echo "[dev-mobile] Celery worker helper not found: ${CELERY_WORKER_SCRIPT}"
    exit 1
  fi
  echo "[dev-mobile] starting celery worker..."
  (
    cd "${ROOT_DIR}"
    exec env \
      APP_ENV="${APP_ENV}" \
      CELERY_BROKER_URL="${CELERY_BROKER_URL}" \
      CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND}" \
      bash "${CELERY_WORKER_SCRIPT}"
  ) &
  CELERY_WORKER_PID=$!
}

start_celery_beat() {
  if [[ ! -f "${CELERY_BEAT_SCRIPT}" ]]; then
    echo "[dev-mobile] Celery beat helper not found: ${CELERY_BEAT_SCRIPT}"
    exit 1
  fi
  echo "[dev-mobile] starting celery beat..."
  (
    cd "${ROOT_DIR}"
    exec env \
      APP_ENV="${APP_ENV}" \
      CELERY_BROKER_URL="${CELERY_BROKER_URL}" \
      CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND}" \
      CELERY_BEAT_SCHEDULE_FILE="${CELERY_BEAT_SCHEDULE_FILE}" \
      bash "${CELERY_BEAT_SCRIPT}"
  ) &
  CELERY_BEAT_PID=$!
}

find_first_available_simulator() {
  # 优先读取当前机器上第一个可用 iOS 模拟器名称，避免写死某个设备型号。
  xcrun simctl list devices available | awk '
    /^[[:space:]]+[^-].*\([0-9A-F-]+\) \((Shutdown|Booted)\)[[:space:]]*$/ {
      line=$0
      sub(/^[[:space:]]+/, "", line)
      sub(/[[:space:]]+\([0-9A-F-]+\)[[:space:]]+\((Shutdown|Booted)\)[[:space:]]*$/, "", line)
      print line
      exit
    }
  '
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
  local simulator_name=""

  if ! xcrun simctl list devices booted | grep -q "Booted"; then
    echo "[dev-mobile] booting iOS Simulator..."
    open -a Simulator >/dev/null 2>&1 || true

    simulator_name="$(find_first_available_simulator)"
    if [[ -z "${simulator_name}" ]]; then
      echo "[dev-mobile] no available iOS simulator device found."
      echo "[dev-mobile] install an iOS Simulator runtime in Xcode > Settings > Components, then rerun this command."
      return 1
    fi

    xcrun simctl boot "${simulator_name}" >/dev/null 2>&1 || true
  fi

  for _ in $(seq 1 20); do
    if xcrun simctl list devices booted | grep -q "Booted"; then
      return 0
    fi
    sleep 1
  done

  echo "[dev-mobile] no booted iOS Simulator detected."
  echo "[dev-mobile] if Simulator.app is already open, verify that at least one iOS Simulator runtime is installed in Xcode > Settings > Components."
  return 1
}

get_booted_simulator_name() {
  # 读取当前已启动模拟器名称，供自动安装 dev client 复用。
  xcrun simctl list devices booted | awk -F '[()]' '/Booted/{gsub(/^[[:space:]]+|[[:space:]]+$/, "", $1); print $1; exit}'
}

install_dev_client_to_booted_simulator() {
  # 若用户手动删除了模拟器内 app，则自动重装到当前已启动设备。
  local simulator_name="$1"

  if [[ -z "${simulator_name}" ]]; then
    echo "[dev-mobile] failed to resolve booted simulator name."
    return 1
  fi

  echo "[dev-mobile] installing iOS dev client to simulator: ${simulator_name}"
  (
    cd "${MOBILE_DIR}"
    npx expo run:ios --device "${simulator_name}" --no-bundler
  )
}

open_expo_in_simulator() {
  # 手动打开 dev client，并对 deep link 做重试，规避 Expo CLI 偶发超时。
  local bundle_id="${IOS_DEV_BUNDLE_ID}"
  local deep_link="exp+${IOS_DEV_SCHEME}://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${EXPO_PORT}"
  local simulator_name=""

  if ! xcrun simctl listapps booted | grep -q "\"${bundle_id}\""; then
    echo "[dev-mobile] iOS dev client is missing from the booted simulator."
    simulator_name="$(get_booted_simulator_name)"
    if ! install_dev_client_to_booted_simulator "${simulator_name}"; then
      echo "[dev-mobile] auto-install failed. run 'bash scripts/dev-mobile.sh build simulator' and retry."
      return 1
    fi

    if ! xcrun simctl listapps booted | grep -q "\"${bundle_id}\""; then
      echo "[dev-mobile] dev client install finished but app is still not detected."
      echo "[dev-mobile] run 'bash scripts/dev-mobile.sh build simulator' and retry."
      return 1
    fi
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
    "${alembic_cmd[@]}" upgrade heads
  )
}

ensure_build_mode_deps() {
  ensure_workspace
  ensure_node_tools
}

normalize_build_target() {
  # 统一解析 build 目标别名，避免脚本和人工输入出现多套写法。
  local raw_target="${1:-}"

  case "${raw_target}" in
    "")
      echo ""
      ;;
    simulator|ios-simulator|ios_simulator|simulator-ios|sim)
      echo "ios-simulator"
      ;;
    device|ios-device|ios_device|device-ios|iphone|physical)
      echo "ios-device"
      ;;
    *)
      echo "[dev-mobile] unknown build target: ${raw_target}" >&2
      echo "[dev-mobile] use 'simulator' or 'device'." >&2
      return 1
      ;;
  esac
}

prompt_build_target() {
  # 交互式选择 iOS 构建目标，避免默认误装到物理设备。
  local choice=""

  echo "[dev-mobile] choose build target:" >&2
  echo "  1) iOS Simulator" >&2
  echo "  2) Physical iPhone" >&2

  while true; do
    printf "Enter choice [1-2]: " >&2
    if [[ -e /dev/tty ]]; then
      read -r choice </dev/tty
    else
      read -r choice
    fi
    case "${choice}" in
      1)
        echo "ios-simulator"
        return 0
        ;;
      2)
        echo "ios-device"
        return 0
        ;;
      *)
        echo "[dev-mobile] invalid choice: ${choice}" >&2
        ;;
    esac
  done
}

resolve_build_target() {
  # 优先读取显式参数；缺失时在交互终端里询问用户选择构建目标。
  local normalized_target=""

  normalized_target="$(normalize_build_target "${BUILD_TARGET_INPUT}")" || return 1
  if [[ -n "${normalized_target}" ]]; then
    echo "${normalized_target}"
    return 0
  fi

  if [[ ! -t 0 ]]; then
    echo "[dev-mobile] build target is required in non-interactive mode." >&2
    echo "[dev-mobile] run 'bash scripts/dev-mobile.sh build simulator' or 'bash scripts/dev-mobile.sh build device'." >&2
    return 1
  fi

  prompt_build_target
}

find_latest_ios_app_binary() {
  # 从 DerivedData 中挑选最近一次构建的 SparkFlowDev.app，供 install-only 模式复用。
  local app_candidates=()
  local latest_app=""

  shopt -s nullglob
  app_candidates=("${HOME}"/Library/Developer/Xcode/DerivedData/SparkFlowDev-*/Build/Products/Debug-iphoneos/SparkFlowDev.app)
  shopt -u nullglob

  if [[ "${#app_candidates[@]}" -eq 0 ]]; then
    echo ""
    return
  fi

  latest_app="$(ls -td "${app_candidates[@]}" 2>/dev/null | head -n 1 || true)"
  echo "${latest_app}"
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
  export APP_DEFAULT_API_BASE_URL="${public_backend_url}"

  echo "[dev-mobile] mode1: starting backend + expo..."
  free_port "${BACKEND_PORT}" "backend"
  free_port "${EXPO_PORT}" "expo"

  ensure_local_postgres
  ensure_local_rabbitmq
  run_backend_migrations
  start_celery_worker
  start_celery_beat

  echo "[dev-mobile] starting backend..."
  (
    cd "${BACKEND_DIR}"
    exec env \
      APP_ENV="${APP_ENV}" \
      CELERY_BROKER_URL="${CELERY_BROKER_URL}" \
      CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND}" \
      CELERY_TASK_ALWAYS_EAGER=false \
      "${BACKEND_PYTHON}" -m uvicorn main:app --host "${BACKEND_HOST}" --port "${BACKEND_PORT}" --reload --no-access-log
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
    exec env APP_ENV="${APP_ENV}" APP_DEFAULT_API_BASE_URL="${APP_DEFAULT_API_BASE_URL}" npx expo start --lan --port "${EXPO_PORT}"
  ) &
  EXPO_PID=$!

  echo
  echo "========================================"
  echo "SparkFlow mobile mode1 is ready"
  echo "Backend API (app network settings): ${public_backend_url}"
  echo "Backend health: ${local_backend_health_url}"
  echo "RabbitMQ broker: ${CELERY_BROKER_URL}"
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
  export APP_DEFAULT_API_BASE_URL="${public_backend_url}"

  echo "[dev-mobile] mode3: starting backend + expo (iOS Simulator)..."
  free_port "${BACKEND_PORT}" "backend"
  free_port "${EXPO_PORT}" "expo"

  ensure_local_postgres
  ensure_local_rabbitmq
  run_backend_migrations
  start_celery_worker
  start_celery_beat

  echo "[dev-mobile] starting backend..."
  (
    cd "${BACKEND_DIR}"
    exec env \
      APP_ENV="${APP_ENV}" \
      CELERY_BROKER_URL="${CELERY_BROKER_URL}" \
      CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND}" \
      CELERY_TASK_ALWAYS_EAGER=false \
      "${BACKEND_PYTHON}" -m uvicorn main:app --host "${BACKEND_HOST}" --port "${BACKEND_PORT}" --reload --no-access-log
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
    exec env APP_ENV="${APP_ENV}" APP_DEFAULT_API_BASE_URL="${APP_DEFAULT_API_BASE_URL}" npx expo start --localhost --dev-client --port "${EXPO_PORT}"
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
  echo "RabbitMQ broker: ${CELERY_BROKER_URL}"
  echo "Tip: app 内网络设置填 127.0.0.1:8000"
  echo "Press Ctrl+C to stop backend and expo."
  echo "========================================"
  echo

  wait "${EXPO_PID}"
}

run_build_mode() {
  local build_target=""
  local run_command_label=""
  local simulator_name=""

  build_target="$(resolve_build_target)"

  echo "[dev-mobile] mode2: rebuilding iOS app only..."
  echo "[dev-mobile] this mode does not start backend or expo."
  echo "[dev-mobile] target: ${build_target}"

  cd "${MOBILE_DIR}"

  echo "[dev-mobile] step 1/4: npm install"
  npm install

  echo "[dev-mobile] step 2/4: expo prebuild --platform ${IOS_PLATFORM} --clean"
  APP_ENV="${APP_ENV}" npx expo prebuild --platform "${IOS_PLATFORM}" --clean

  echo "[dev-mobile] step 3/4: pod-install ios"
  npx pod-install ios

  case "${build_target}" in
    ios-simulator)
      ensure_booted_simulator
      simulator_name="$(get_booted_simulator_name)"
      if [[ -z "${simulator_name}" ]]; then
        simulator_name="$(find_first_available_simulator)"
      fi

      if [[ -z "${simulator_name}" ]]; then
        echo "[dev-mobile] no available iOS simulator device found."
        echo "[dev-mobile] install an iOS Simulator runtime in Xcode > Settings > Components, then retry."
        exit 1
      fi

      echo "[dev-mobile] step 4/4: expo run:ios --device ${simulator_name}"
      APP_ENV="${APP_ENV}" npx expo run:ios --device "${simulator_name}"
      run_command_label="bash scripts/dev-mobile.sh simulator"
      ;;
    ios-device)
      echo "[dev-mobile] step 4/4: expo run:ios --device"
      APP_ENV="${APP_ENV}" npx expo run:ios --device
      run_command_label="bash scripts/dev-mobile.sh"
      ;;
    *)
      echo "[dev-mobile] unsupported build target: ${build_target}"
      exit 1
      ;;
  esac

  echo
  echo "========================================"
  echo "Mode2 build finished."
  echo "Next step: run '${run_command_label}'"
  echo "That will start backend + expo for daily development."
  echo "========================================"
}

run_install_mode() {
  # install-only 仅重试设备安装，不触发 prebuild/pod-install，避免重复重建。
  local app_binary="${IOS_APP_BINARY:-}"

  echo "[dev-mobile] mode5: installing existing iOS app only..."
  echo "[dev-mobile] this mode does not rebuild native project."

  cd "${MOBILE_DIR}"

  if [[ -z "${app_binary}" ]]; then
    app_binary="$(find_latest_ios_app_binary)"
  fi

  if [[ -z "${app_binary}" ]]; then
    echo "[dev-mobile] no existing SparkFlowDev.app found in DerivedData."
    echo "[dev-mobile] run 'bash scripts/dev-mobile.sh build' first, then retry install mode."
    exit 1
  fi

  if [[ ! -d "${app_binary}" ]]; then
    echo "[dev-mobile] app binary path does not exist: ${app_binary}"
    echo "[dev-mobile] set IOS_APP_BINARY to a valid .app path or rerun build mode."
    exit 1
  fi

  echo "[dev-mobile] using binary: ${app_binary}"
  if [[ -n "${IOS_DEVICE:-}" ]]; then
    echo "[dev-mobile] target device: ${IOS_DEVICE}"
    APP_ENV="${APP_ENV}" npx expo run:ios --device "${IOS_DEVICE}" --binary "${app_binary}"
  else
    APP_ENV="${APP_ENV}" npx expo run:ios --device --binary "${app_binary}"
  fi

  echo
  echo "========================================"
  echo "Mode5 install finished."
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
  install)
    ensure_build_mode_deps
    run_install_mode
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
