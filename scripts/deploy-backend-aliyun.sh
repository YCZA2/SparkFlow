#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"

REMOTE_HOST_ALIAS="${SPARKFLOW_REMOTE_HOST:-aliyun}"
REMOTE_APP_DIR="${SPARKFLOW_REMOTE_APP_DIR:-/home/ycza/apps/sparkflow/backend}"
REMOTE_ENV_FILE="${SPARKFLOW_REMOTE_ENV_FILE:-/home/ycza/.config/sparkflow/backend.env}"
REMOTE_SERVICE_NAME="${SPARKFLOW_REMOTE_SERVICE_NAME:-sparkflow-backend}"
REMOTE_DOMAIN="${SPARKFLOW_REMOTE_DOMAIN:-www.onepercent.ltd}"
ACTION="${1:-deploy}"

print_usage() {
  cat <<'USAGE'
用法：
  bash scripts/deploy-backend-aliyun.sh deploy
  bash scripts/deploy-backend-aliyun.sh sync
  bash scripts/deploy-backend-aliyun.sh install
  bash scripts/deploy-backend-aliyun.sh migrate
  bash scripts/deploy-backend-aliyun.sh restart
  bash scripts/deploy-backend-aliyun.sh health
  bash scripts/deploy-backend-aliyun.sh status

说明：
  - 默认通过 `ssh aliyun` / `rsync ... aliyun:` 连接远端
  - 远端代码目录默认是 /home/ycza/apps/sparkflow/backend
  - 远端生产环境变量默认放在 /home/ycza/.config/sparkflow/backend.env
  - `deploy` 会依次执行 sync -> install -> migrate -> restart -> health

可覆盖环境变量：
  SPARKFLOW_REMOTE_HOST
  SPARKFLOW_REMOTE_APP_DIR
  SPARKFLOW_REMOTE_ENV_FILE
  SPARKFLOW_REMOTE_SERVICE_NAME
  SPARKFLOW_REMOTE_DOMAIN
USAGE
}

ensure_local_tools() {
  # 确保本地具备发布所需的 ssh / rsync / curl。
  local tool
  for tool in ssh rsync curl; do
    if ! command -v "${tool}" >/dev/null 2>&1; then
      echo "[deploy-backend-aliyun] missing required tool: ${tool}"
      exit 1
    fi
  done
}

ensure_backend_workspace() {
  # 确保本地 backend 目录存在，避免错误地在其他仓库执行。
  if [[ ! -d "${BACKEND_DIR}" ]]; then
    echo "[deploy-backend-aliyun] backend directory not found: ${BACKEND_DIR}"
    exit 1
  fi
}

run_remote() {
  # 统一通过 ssh alias 执行远端命令，保持调用点简洁。
  ssh "${REMOTE_HOST_ALIAS}" "$@"
}

prepare_remote_dirs() {
  # 预先创建远端目录，避免首次 rsync 或日志目录缺失。
  run_remote "mkdir -p '${REMOTE_APP_DIR}' '${REMOTE_APP_DIR}/uploads' '${REMOTE_APP_DIR}/chroma_data' \"\$(dirname '${REMOTE_ENV_FILE}')\""
}

assert_remote_env_file() {
  # 发布前要求外置 env 文件已存在，避免服务带默认值启动。
  run_remote "test -f '${REMOTE_ENV_FILE}'" || {
    echo "[deploy-backend-aliyun] remote env file not found: ${REMOTE_ENV_FILE}"
    echo "[deploy-backend-aliyun] create it first, then rerun deploy."
    exit 1
  }
}

assert_remote_env_is_clean() {
  # 阻止远端遗留 .env 干扰 production 配置覆盖顺序。
  if run_remote "test -f '${REMOTE_APP_DIR}/.env'"; then
    echo "[deploy-backend-aliyun] found stale ${REMOTE_APP_DIR}/.env"
    echo "[deploy-backend-aliyun] remove or relocate it before deploying production."
    exit 1
  fi
}

sync_backend() {
  # 仅同步 backend 运行所需代码，并排除虚拟环境与运行期数据目录。
  prepare_remote_dirs
  rsync -az --delete \
    --exclude '.venv' \
    --exclude '.env' \
    --exclude '__pycache__' \
    --exclude '.pytest_cache' \
    --exclude '.hypothesis' \
    --exclude 'runtime_logs' \
    --exclude 'uploads' \
    --exclude 'chroma_data' \
    "${BACKEND_DIR}/" "${REMOTE_HOST_ALIAS}:${REMOTE_APP_DIR}/"
}

install_requirements() {
  # 在远端复用已有虚拟环境并更新依赖，保证 requirements 变更可立即生效。
  run_remote "
    set -euo pipefail
    cd '${REMOTE_APP_DIR}'
    python3 -m venv .venv
    . .venv/bin/activate
    pip install -r requirements.txt
  "
}

run_migrations() {
  # 显式导入生产 env 文件，再执行 Alembic 迁移到最新 heads。
  assert_remote_env_file
  run_remote "
    set -euo pipefail
    cd '${REMOTE_APP_DIR}'
    . .venv/bin/activate
    set -a
    . '${REMOTE_ENV_FILE}'
    set +a
    APP_ENV=production alembic upgrade heads
  "
}

restart_service() {
  # 通过 systemd 重启单 worker FastAPI 进程，并输出当前服务状态。
  run_remote "
    set -euo pipefail
    sudo systemctl daemon-reload
    sudo systemctl reset-failed '${REMOTE_SERVICE_NAME}' || true
    sudo systemctl restart '${REMOTE_SERVICE_NAME}'
    sleep 3
    sudo systemctl status '${REMOTE_SERVICE_NAME}' --no-pager -l | sed -n '1,60p'
  "
}

check_health() {
  # 同时验证本机 8000 与 nginx 同域名反代入口。
  run_remote "
    set -euo pipefail
    curl -fsS http://127.0.0.1:8000/health
    echo
    curl -k -fsS --resolve '${REMOTE_DOMAIN}:443:127.0.0.1' 'https://${REMOTE_DOMAIN}/api/health'
    echo
  "
}

show_status() {
  # 汇总查看 systemd 与最近日志，便于排查发布后的运行状态。
  run_remote "
    set -euo pipefail
    sudo systemctl status '${REMOTE_SERVICE_NAME}' --no-pager -l | sed -n '1,80p'
    echo
    sudo journalctl -u '${REMOTE_SERVICE_NAME}' -n 80 --no-pager
  "
}

deploy_all() {
  # 执行一轮完整发布：同步、装依赖、迁移、重启和健康检查。
  assert_remote_env_file
  assert_remote_env_is_clean
  sync_backend
  install_requirements
  run_migrations
  restart_service
  check_health
}

ensure_local_tools
ensure_backend_workspace

case "${ACTION}" in
  deploy)
    deploy_all
    ;;
  sync)
    assert_remote_env_is_clean
    sync_backend
    ;;
  install)
    install_requirements
    ;;
  migrate)
    assert_remote_env_is_clean
    run_migrations
    ;;
  restart)
    restart_service
    ;;
  health)
    check_health
    ;;
  status)
    show_status
    ;;
  help|-h|--help)
    print_usage
    ;;
  *)
    echo "[deploy-backend-aliyun] unsupported action: ${ACTION}"
    echo
    print_usage
    exit 1
    ;;
esac
