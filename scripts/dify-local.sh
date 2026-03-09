#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
DIFY_VENDOR_DIR="${BACKEND_DIR}/.vendor/dify"
DIFY_DOCKER_DIR="${DIFY_VENDOR_DIR}/docker"
DIFY_COMPOSE_PROJECT="${DIFY_COMPOSE_PROJECT:-sparkflow-dify}"
DIFY_LOCAL_PORT="${DIFY_LOCAL_PORT:-18080}"
DEFAULT_DIFY_REPO="${DEFAULT_DIFY_REPO:-https://github.com/langgenius/dify.git}"
MODE="${1:-start}"

print_usage() {
  cat <<'USAGE'
用法：
  bash scripts/dify-local.sh install   # 拉取官方 Dify 并生成本地 docker 配置
  bash scripts/dify-local.sh start     # 启动本地 Dify（默认）
  bash scripts/dify-local.sh stop      # 停止本地 Dify
  bash scripts/dify-local.sh restart   # 重启本地 Dify
  bash scripts/dify-local.sh status    # 查看容器状态
  bash scripts/dify-local.sh logs      # 查看容器日志
  bash scripts/dify-local.sh help      # 查看帮助

环境变量：
  DIFY_VERSION=v1.11.2                 # 指定官方 release tag；默认自动取最新 release
  DIFY_LOCAL_PORT=18080                # 本地暴露端口，避免占用 80
  DIFY_COMPOSE_PROJECT=sparkflow-dify  # docker compose 项目名
USAGE
}

# 中文注释：统一检查本地命令依赖，避免执行到半途失败。
require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "[dify-local] missing command: ${cmd}"
    exit 1
  fi
}

# 中文注释：优先用 jq，缺失时退回 python 解析 GitHub API。
parse_json_tag_name() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.tag_name'
    return
  fi

  python3 -c 'import json,sys; print(json.load(sys.stdin)["tag_name"])'
}

# 中文注释：默认解析官方最新 release，允许通过环境变量固定版本。
resolve_dify_version() {
  if [[ -n "${DIFY_VERSION:-}" ]]; then
    echo "${DIFY_VERSION}"
    return
  fi

  curl -fsSL "https://api.github.com/repos/langgenius/dify/releases/latest" | parse_json_tag_name
}

# 中文注释：首次安装时克隆官方仓库，后续只同步 tags。
ensure_dify_repo() {
  local version="$1"

  require_command git

  mkdir -p "${BACKEND_DIR}/.vendor"

  if [[ ! -d "${DIFY_VENDOR_DIR}/.git" ]]; then
    git clone "${DEFAULT_DIFY_REPO}" "${DIFY_VENDOR_DIR}"
  fi

  git -C "${DIFY_VENDOR_DIR}" fetch --tags --force
  git -C "${DIFY_VENDOR_DIR}" checkout "${version}"
}

# 中文注释：生成本地 docker 环境覆盖，固定端口并启用 PostgreSQL profile。
ensure_docker_env() {
  if [[ ! -d "${DIFY_DOCKER_DIR}" ]]; then
    echo "[dify-local] docker directory not found: ${DIFY_DOCKER_DIR}"
    exit 1
  fi

  if [[ ! -f "${DIFY_DOCKER_DIR}/.env" ]]; then
    cp "${DIFY_DOCKER_DIR}/.env.example" "${DIFY_DOCKER_DIR}/.env"
  fi

  python3 - "${DIFY_DOCKER_DIR}/.env" "${DIFY_LOCAL_PORT}" <<'PY'
from pathlib import Path
import sys

env_path = Path(sys.argv[1])
port = sys.argv[2]
lines = env_path.read_text().splitlines()
updates = {
    "EXPOSE_NGINX_PORT": port,
    "EXPOSE_NGINX_SSL_PORT": "18443",
}

present = set()
result = []
for line in lines:
    if "=" in line and not line.lstrip().startswith("#"):
        key = line.split("=", 1)[0]
        if key in updates:
            result.append(f"{key}={updates[key]}")
            present.add(key)
            continue
    result.append(line)

for key, value in updates.items():
    if key not in present:
        result.append(f"{key}={value}")

env_path.write_text("\n".join(result) + "\n")
PY
}

# 中文注释：封装 compose 调用，固定 profile 和项目名，减少用户记忆成本。
run_compose() {
  require_command docker
  (
    cd "${DIFY_DOCKER_DIR}"
    docker compose --project-name "${DIFY_COMPOSE_PROJECT}" --profile postgresql "$@"
  )
}

run_install() {
  local version

  require_command curl
  require_command python3

  version="$(resolve_dify_version)"
  echo "[dify-local] using Dify ${version}"

  ensure_dify_repo "${version}"
  ensure_docker_env

  echo "[dify-local] repository ready: ${DIFY_VENDOR_DIR}"
  echo "[dify-local] open Dify at: http://127.0.0.1:${DIFY_LOCAL_PORT}"
}

run_start() {
  run_install
  run_compose up -d
  echo "[dify-local] started at http://127.0.0.1:${DIFY_LOCAL_PORT}"
}

run_stop() {
  if [[ ! -d "${DIFY_DOCKER_DIR}" ]]; then
    echo "[dify-local] nothing to stop; install directory not found"
    exit 0
  fi
  run_compose stop
}

run_restart() {
  if [[ ! -d "${DIFY_DOCKER_DIR}" ]]; then
    run_start
    return
  fi
  run_compose restart
}

run_status() {
  if [[ ! -d "${DIFY_DOCKER_DIR}" ]]; then
    echo "[dify-local] not installed"
    exit 0
  fi
  run_compose ps
}

run_logs() {
  if [[ ! -d "${DIFY_DOCKER_DIR}" ]]; then
    echo "[dify-local] not installed"
    exit 0
  fi
  run_compose logs --tail=200
}

case "${MODE}" in
  install)
    run_install
    ;;
  start)
    run_start
    ;;
  stop)
    run_stop
    ;;
  restart)
    run_restart
    ;;
  status)
    run_status
    ;;
  logs)
    run_logs
    ;;
  help|-h|--help)
    print_usage
    ;;
  *)
    echo "[dify-local] unknown mode: ${MODE}"
    print_usage
    exit 1
    ;;
esac
