#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-start}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}"

show_usage() {
  # 展示 Codex Run 按钮对应的 Expo 启动模式，便于本地直接复用。
  cat <<'USAGE'
usage: ./script/build_and_run.sh [mode]

Modes:
  start, run         Start the Expo dev server
  --ios, ios         Start Expo and open iOS
  --android, android Start Expo and open Android
  --dev-client, dev-client
                     Start Expo in development-client mode
  --tunnel, tunnel   Start Expo using tunnel transport
  --doctor, doctor   Run Expo diagnostics
  --help, help       Show this help
USAGE
}

resolve_expo_cmd() {
  # 按锁文件优先选择项目实际使用的包管理器，并保留 EXPO_CLI 覆盖入口。
  if [[ -n "${EXPO_CLI:-}" ]]; then
    # shellcheck disable=SC2206
    EXPO_CMD=(${EXPO_CLI})
    return
  fi

  if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
    EXPO_CMD=(pnpm exec expo)
  elif [[ -f yarn.lock ]] && command -v yarn >/dev/null 2>&1; then
    EXPO_CMD=(yarn expo)
  elif { [[ -f bun.lock ]] || [[ -f bun.lockb ]]; } && command -v bun >/dev/null 2>&1; then
    EXPO_CMD=(bunx expo)
  else
    EXPO_CMD=(npx expo)
  fi
}

run_doctor() {
  # 统一从当前项目上下文执行 Expo Doctor，避免命令入口分散。
  if [[ -f pnpm-lock.yaml ]] && command -v pnpm >/dev/null 2>&1; then
    pnpm exec expo-doctor
  elif [[ -f yarn.lock ]] && command -v yarn >/dev/null 2>&1; then
    yarn expo-doctor
  elif { [[ -f bun.lock ]] || [[ -f bun.lockb ]]; } && command -v bun >/dev/null 2>&1; then
    bunx expo-doctor
  else
    npx expo-doctor
  fi
}

resolve_expo_cmd

case "${MODE}" in
  start|run)
    exec "${EXPO_CMD[@]}" start
    ;;
  --ios|ios)
    exec "${EXPO_CMD[@]}" start --ios
    ;;
  --android|android)
    exec "${EXPO_CMD[@]}" start --android
    ;;
  --dev-client|dev-client)
    exec "${EXPO_CMD[@]}" start --dev-client
    ;;
  --tunnel|tunnel)
    exec "${EXPO_CMD[@]}" start --tunnel
    ;;
  --doctor|doctor)
    run_doctor
    ;;
  --help|help)
    show_usage
    ;;
  *)
    show_usage >&2
    exit 2
    ;;
esac
