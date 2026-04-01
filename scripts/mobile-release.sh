#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MOBILE_DIR="${ROOT_DIR}/mobile"

ACTION="${1:-help}"
CHANNEL="${2:-}"
PLATFORM="${3:-}"
shift $(( $# > 0 ? 1 : 0 )) || true
shift $(( $# > 0 ? 1 : 0 )) || true
shift $(( $# > 0 ? 1 : 0 )) || true
EXTRA_ARGS=("$@")

print_usage() {
  cat <<'USAGE'
用法：
  bash scripts/mobile-release.sh build dev ios [额外 EAS 参数]
  bash scripts/mobile-release.sh build dev android [额外 EAS 参数]
  bash scripts/mobile-release.sh build prod ios [额外 EAS 参数]
  bash scripts/mobile-release.sh build prod android [额外 EAS 参数]
  bash scripts/mobile-release.sh submit prod ios [额外 EAS 参数]

说明：
  - `dev` 统一映射到 internal development device 包（APP_ENV=development）
  - `prod` 统一映射到 production 包（APP_ENV=production）
  - `submit` 当前只允许 prod，避免误把开发包提审
  - 额外参数会原样透传给 `eas build` / `eas submit`

示例：
  bash scripts/mobile-release.sh build dev ios
  bash scripts/mobile-release.sh build prod android --non-interactive
  bash scripts/mobile-release.sh submit prod ios --latest
USAGE
}

ensure_workspace() {
  if [[ ! -d "${MOBILE_DIR}" ]]; then
    echo "[mobile-release] mobile/ directory not found."
    exit 1
  fi
}

ensure_node_tools() {
  if ! command -v npm >/dev/null 2>&1; then
    echo "[mobile-release] npm not found. Please install Node.js first."
    exit 1
  fi
  if ! command -v npx >/dev/null 2>&1; then
    echo "[mobile-release] npx not found. Please install Node.js first."
    exit 1
  fi
}

resolve_profile() {
  local action="$1"
  local channel="$2"

  case "${action}:${channel}" in
    build:dev)
      echo "development:device"
      ;;
    build:prod)
      echo "production"
      ;;
    submit:prod)
      echo "production"
      ;;
    *)
      echo ""
      ;;
  esac
}

resolve_app_env() {
  local channel="$1"
  case "${channel}" in
    dev)
      echo "development"
      ;;
    prod)
      echo "production"
      ;;
    *)
      echo ""
      ;;
  esac
}

validate_inputs() {
  if [[ "${ACTION}" == "help" || "${ACTION}" == "-h" || "${ACTION}" == "--help" ]]; then
    print_usage
    exit 0
  fi

  if [[ "${ACTION}" != "build" && "${ACTION}" != "submit" ]]; then
    echo "[mobile-release] unsupported action: ${ACTION}"
    echo
    print_usage
    exit 1
  fi

  if [[ "${CHANNEL}" != "dev" && "${CHANNEL}" != "prod" ]]; then
    echo "[mobile-release] unsupported channel: ${CHANNEL}"
    echo
    print_usage
    exit 1
  fi

  if [[ "${PLATFORM}" != "ios" && "${PLATFORM}" != "android" ]]; then
    echo "[mobile-release] unsupported platform: ${PLATFORM}"
    echo
    print_usage
    exit 1
  fi

  if [[ "${ACTION}" == "submit" && "${CHANNEL}" != "prod" ]]; then
    echo "[mobile-release] submit only supports prod channel."
    exit 1
  fi
}

run_build() {
  local profile app_env
  profile="$(resolve_profile "${ACTION}" "${CHANNEL}")"
  app_env="$(resolve_app_env "${CHANNEL}")"

  if [[ -z "${profile}" || -z "${app_env}" ]]; then
    echo "[mobile-release] failed to resolve profile or APP_ENV."
    exit 1
  fi

  echo "[mobile-release] action=${ACTION} channel=${CHANNEL} platform=${PLATFORM} profile=${profile} APP_ENV=${app_env}"
  (
    cd "${MOBILE_DIR}"
    exec env APP_ENV="${app_env}" npx eas build --platform "${PLATFORM}" --profile "${profile}" "${EXTRA_ARGS[@]}"
  )
}

run_submit() {
  local profile app_env
  profile="$(resolve_profile "${ACTION}" "${CHANNEL}")"
  app_env="$(resolve_app_env "${CHANNEL}")"

  if [[ -z "${profile}" || -z "${app_env}" ]]; then
    echo "[mobile-release] failed to resolve profile or APP_ENV."
    exit 1
  fi

  echo "[mobile-release] action=${ACTION} channel=${CHANNEL} platform=${PLATFORM} profile=${profile} APP_ENV=${app_env}"
  (
    cd "${MOBILE_DIR}"
    exec env APP_ENV="${app_env}" npx eas submit --platform "${PLATFORM}" --profile "${profile}" "${EXTRA_ARGS[@]}"
  )
}

ensure_workspace
ensure_node_tools
validate_inputs

case "${ACTION}" in
  build)
    run_build
    ;;
  submit)
    run_submit
    ;;
  help|-h|--help)
    print_usage
    ;;
  *)
    print_usage
    exit 1
    ;;
esac
