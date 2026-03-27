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
FORCE_REBUILD=""

print_usage() {
  cat <<'USAGE'
用法：
  bash scripts/dev-mobile.sh              # 启动后端 + Expo（LAN 模式，多设备共用）
  bash scripts/dev-mobile.sh ios          # iOS 开发（自动检测是否需要 build）
  bash scripts/dev-mobile.sh ios:rebuild  # 强制重建 iOS 并启动
  bash scripts/dev-mobile.sh android      # Android 开发（自动检测是否需要 build）
  bash scripts/dev-mobile.sh android:rebuild # 强制重建 Android 并启动
  bash scripts/dev-mobile.sh web          # Web 开发
  bash scripts/dev-mobile.sh help         # 查看帮助

说明：
  ios       → 自动检测原生配置变化，按需 rebuild 后启动 iOS 模拟器
  android   → 自动检测原生配置变化，按需 rebuild 后启动 Android
  web       → 启动后端 + Expo Web，浏览器调试
  默认模式   → 启动后端 + Expo LAN，适合已安装 dev client 的设备扫码连接

自动检测规则：
  - 原生目录不存在 → 自动 build
  - 检测 app.json/app.config/package.json/ios/Podfile 等 native 配置变化 → 自动 build
  - 使用 .ios-build-hash / .android-build-hash 标记文件追踪上次 build 状态
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

# 判断文件是否属于会影响原生工程的输入，避免把普通 JS/TS 改动误判成 rebuild。
is_native_input_path() {
  local platform="$1"
  local path="$2"

  case "${path}" in
    app.json|app.config.js|app.config.ts|app.config.mjs|app.config.cjs|app.config.json|package.json|package-lock.json|eas.json)
      return 0
      ;;
    "${platform}"/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

# 计算原生输入签名，覆盖未提交改动并避免同一批改动重复 rebuild。
compute_build_signature() {
  local platform="$1"
  local native_dir="${MOBILE_DIR}/${platform}"
  local file=""
  local -a files=()

  if [[ ! -d "${native_dir}" ]]; then
    echo "missing:${platform}"
    return 0
  fi

  for file in app.json app.config.js app.config.ts app.config.mjs app.config.cjs app.config.json package.json package-lock.json eas.json; do
    if [[ -f "${MOBILE_DIR}/${file}" ]]; then
      files+=("${file}")
    fi
  done

  while IFS= read -r file; do
    files+=("${file}")
  done < <(cd "${MOBILE_DIR}" && find "${platform}" -type f | sort)

  if [[ "${#files[@]}" -eq 0 ]]; then
    echo "empty:${platform}"
    return 0
  fi

  (
    cd "${MOBILE_DIR}"
    shasum "${files[@]}" | shasum | awk '{print $1}'
  )
}

# 找出会影响当前平台原生工程的改动文件，便于提示用户为什么触发 rebuild。
collect_native_input_changes() {
  local platform="$1"
  local path=""
  local -a raw_files=()
  local -a changed_files=()

  while IFS= read -r path; do
    [[ -n "${path}" ]] && raw_files+=("${path}")
  done < <(
    cd "${MOBILE_DIR}" && {
      git diff --name-only 2>/dev/null || true
      git diff --cached --name-only 2>/dev/null || true
      git ls-files --others --exclude-standard 2>/dev/null || true
    } | sort -u
  )

  for path in "${raw_files[@]}"; do
    if is_native_input_path "${platform}" "${path}"; then
      changed_files+=("${path}")
    fi
  done

  printf '%s\n' "${changed_files[@]}"
}

# 判断 iOS 是否需要 rebuild，并给出触发 rebuild 的关键原因。
needs_ios_rebuild() {
  local platform="ios"
  local build_marker="${MOBILE_DIR}/.${platform}-build-hash"
  local last_signature current_signature changed_files

  if [[ ! -f "${build_marker}" ]]; then
    echo "[dev-mobile] 检测到缺少 build 标记文件，需要 build"
    return 0
  fi

  current_signature="$(compute_build_signature "${platform}")"
  last_signature="$(cat "${build_marker}" 2>/dev/null || true)"

  if [[ -z "${last_signature}" || -z "${current_signature}" ]]; then
    echo "[dev-mobile] 无法计算原生输入签名，保守处理需要 build"
    return 0
  fi

  if [[ "${last_signature}" != "${current_signature}" ]]; then
    echo "[dev-mobile] 检测到 iOS 原生输入变化，需要 rebuild"
    changed_files="$(collect_native_input_changes "${platform}")"
    if [[ -n "${changed_files}" ]]; then
      echo "[dev-mobile] 变化文件："
      echo "${changed_files}" | head -5
    fi
    return 0
  fi

  return 1
}

# 判断 Android 是否需要 rebuild，并给出触发 rebuild 的关键原因。
needs_android_rebuild() {
  local platform="android"
  local build_marker="${MOBILE_DIR}/.${platform}-build-hash"
  local last_signature current_signature changed_files

  if [[ ! -f "${build_marker}" ]]; then
    echo "[dev-mobile] 检测到缺少 build 标记文件，需要 build"
    return 0
  fi

  current_signature="$(compute_build_signature "${platform}")"
  last_signature="$(cat "${build_marker}" 2>/dev/null || true)"

  if [[ -z "${last_signature}" || -z "${current_signature}" ]]; then
    echo "[dev-mobile] 无法计算原生输入签名，保守处理需要 build"
    return 0
  fi

  if [[ "${last_signature}" != "${current_signature}" ]]; then
    echo "[dev-mobile] 检测到 Android 原生输入变化，需要 rebuild"
    changed_files="$(collect_native_input_changes "${platform}")"
    if [[ -n "${changed_files}" ]]; then
      echo "[dev-mobile] 变化文件："
      echo "${changed_files}" | head -5
    fi
    return 0
  fi

  return 1
}

# 保存 build 标记
save_build_marker() {
  local platform="$1"
  local build_marker="${MOBILE_DIR}/.${platform}-build-hash"
  local current_signature

  current_signature="$(compute_build_signature "${platform}")"
  if [[ -n "${current_signature}" ]]; then
    echo "${current_signature}" > "${build_marker}"
    echo "[dev-mobile] 已保存 build 标记: ${build_marker}"
  fi
}

# 执行 iOS build 并保存标记
run_ios_build() {
  echo "[dev-mobile] 执行 iOS build..."

  cd "${MOBILE_DIR}"

  echo "[dev-mobile] step 1/4: npm install"
  npm install

  echo "[dev-mobile] step 2/4: expo prebuild --platform ios --clean"
  npx expo prebuild --platform "${IOS_PLATFORM}" --clean

  echo "[dev-mobile] step 3/4: pod-install ios"
  npx pod-install ios

  echo "[dev-mobile] step 4/4: expo run:ios --device"
  npx expo run:ios --device

  save_build_marker "ios"
}

# 执行 Android build 并保存标记
run_android_build() {
  echo "[dev-mobile] 执行 Android build..."

  cd "${MOBILE_DIR}"

  echo "[dev-mobile] step 1/3: npm install"
  npm install

  echo "[dev-mobile] step 2/3: expo prebuild --platform android --clean"
  npx expo prebuild --platform "android" --clean

  echo "[dev-mobile] step 3/3: expo run:android"
  npx expo run:android

  save_build_marker "android"
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
  local bundle_id="com.sparkflow.mobile"
  local deep_link="exp+sparkflow-mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${EXPO_PORT}"
  local simulator_name=""

  if ! xcrun simctl listapps booted | grep -q "\"${bundle_id}\""; then
    echo "[dev-mobile] iOS dev client is missing from the booted simulator."
    simulator_name="$(get_booted_simulator_name)"
    if ! install_dev_client_to_booted_simulator "${simulator_name}"; then
      echo "[dev-mobile] auto-install failed. run 'bash scripts/dev-mobile.sh ios:rebuild' and retry."
      return 1
    fi

    if ! xcrun simctl listapps booted | grep -q "\"${bundle_id}\""; then
      echo "[dev-mobile] dev client install finished but app is still not detected."
      echo "[dev-mobile] run 'bash scripts/dev-mobile.sh ios:rebuild' and retry."
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
    exec npx expo start --dev-client --lan --port "${EXPO_PORT}"
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

run_web_mode() {
  # Web 联调模式保持后端与数据库一并启动，方便浏览器直接连本地 API。
  local local_backend_url local_backend_health_url backend_ready

  trap cleanup EXIT INT TERM

  local_backend_url="http://127.0.0.1:${BACKEND_PORT}"
  local_backend_health_url="http://127.0.0.1:${BACKEND_PORT}/health"

  echo "[dev-mobile] mode4: starting backend + expo web..."
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
    echo "[dev-mobile] backend readiness check timeout, but continue to start expo web."
  fi

  echo "[dev-mobile] starting expo (Web mode)..."
  (
    cd "${MOBILE_DIR}"
    exec npx expo start --web --port "${EXPO_PORT}"
  ) &
  EXPO_PID=$!

  echo
  echo "========================================"
  echo "SparkFlow mobile mode4 is ready"
  echo "Backend API (web app should use this): ${local_backend_url}"
  echo "Backend health: ${local_backend_health_url}"
  echo "Expo Web: http://127.0.0.1:${EXPO_PORT}"
  echo "Tip: 浏览器里调试业务接口时，应用内后端地址仍应填写 8000"
  echo "Press Ctrl+C to stop backend and expo."
  echo "========================================"
  echo

  wait "${EXPO_PID}"
}

run_ios_mode() {
  local needs_build=0

  trap cleanup EXIT INT TERM

  # 检测是否需要 rebuild
  if [[ -n "${FORCE_REBUILD}" ]] || needs_ios_rebuild; then
    needs_build=1
  fi

  if [[ "${needs_build}" -eq 1 ]]; then
    echo "[dev-mobile] iOS 模式：检测到需要 rebuild，正在执行..."
    run_ios_build
    echo
    echo "[dev-mobile] build 完成，继续启动后端 + Expo..."
  else
    echo "[dev-mobile] iOS 模式：跳过 build，直接启动..."
  fi

  # 启动后端 + iOS 模拟器，复用原有 simulator 调试逻辑。
  local local_ip public_backend_url local_backend_health_url backend_ready metro_ready

  local_ip="127.0.0.1"
  public_backend_url="http://${local_ip}:${BACKEND_PORT}"
  local_backend_health_url="http://127.0.0.1:${BACKEND_PORT}/health"

  echo "[dev-mobile] 启动后端 + Expo（iOS Simulator）..."
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
  echo "SparkFlow iOS 模式已就绪"
  echo "Backend API: ${public_backend_url}"
  echo "Backend health: ${local_backend_health_url}"
  echo "Tip: app 内网络设置填 127.0.0.1:8000"
  echo "Press Ctrl+C to stop backend and expo."
  echo "========================================"
  echo

  wait "${EXPO_PID}"
}

run_android_mode() {
  local needs_build=0

  trap cleanup EXIT INT TERM

  # 检测是否需要 rebuild
  if [[ -n "${FORCE_REBUILD}" ]] || needs_android_rebuild; then
    needs_build=1
  fi

  if [[ "${needs_build}" -eq 1 ]]; then
    echo "[dev-mobile] Android 模式：检测到需要 rebuild，正在执行..."
    run_android_build
    echo
    echo "[dev-mobile] build 完成，继续启动后端 + Expo..."
  else
    echo "[dev-mobile] Android 模式：跳过 build，直接启动..."
  fi

  # 启动后端 + Expo（LAN 模式，Android 设备扫码连接）
  local local_ip public_backend_url local_backend_health_url backend_ready

  local_ip="$(get_local_ip)"
  public_backend_url="http://${local_ip}:${BACKEND_PORT}"
  local_backend_health_url="http://127.0.0.1:${BACKEND_PORT}/health"

  echo "[dev-mobile] 启动后端 + Expo（LAN 模式，Android 设备连接）..."
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
    if curl -fsSI "${local_backend_health_url}" >/dev/null 2>&1; then
      backend_ready=1
      break
    fi
    sleep 1
  done

  if [[ "${backend_ready}" -ne 1 ]]; then
    echo "[dev-mobile] backend readiness check timeout, but continue to start expo."
  fi

  echo "[dev-mobile] starting expo (Android dev client)..."
  (
    cd "${MOBILE_DIR}"
    exec npx expo start --dev-client --lan --port "${EXPO_PORT}"
  ) &
  EXPO_PID=$!

  echo
  echo "========================================"
  echo "SparkFlow Android 模式已就绪"
  echo "Backend API (app network settings): ${public_backend_url}"
  echo "Backend health: ${local_backend_health_url}"
  echo "Metro / Expo bundler: http://${local_ip}:${EXPO_PORT}"
  echo "Tip 1: app 内网络设置填 8000，不要填 8081"
  echo "Tip 2: Android 设备请打开已安装的 SparkFlow dev client 或扫码连接"
  echo "Press Ctrl+C to stop backend and expo."
  echo "========================================"
  echo

  wait "${EXPO_PID}"
}

case "${MODE}" in
  start)
    ensure_start_mode_deps
    run_start_mode
    ;;
  ios)
    ensure_start_mode_deps
    run_ios_mode
    ;;
  ios:rebuild)
    ensure_start_mode_deps
    FORCE_REBUILD=1 run_ios_mode
    ;;
  android)
    ensure_start_mode_deps
    run_android_mode
    ;;
  android:rebuild)
    ensure_start_mode_deps
    FORCE_REBUILD=1 run_android_mode
    ;;
  web)
    ensure_start_mode_deps
    run_web_mode
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
