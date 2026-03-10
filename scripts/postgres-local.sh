#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.postgres.yml"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-sparkflow-postgres}"
POSTGRES_SERVICE="postgres"
DEFAULT_DATABASE_URL="postgresql+psycopg://sparkflow:sparkflow@127.0.0.1:5432/sparkflow"
DEFAULT_TEST_DATABASE_URL="postgresql+psycopg://sparkflow:sparkflow@127.0.0.1:5432/sparkflow_test"
MODE="${1:-start}"
TARGET="${2:-dev}"

print_usage() {
  cat <<'USAGE'
用法：
  bash scripts/postgres-local.sh start [dev|test|all]    # 启动本地 PostgreSQL 并等待就绪
  bash scripts/postgres-local.sh stop                    # 停止本地 PostgreSQL
  bash scripts/postgres-local.sh status                  # 查看 PostgreSQL 容器状态
  bash scripts/postgres-local.sh logs                    # 查看 PostgreSQL 容器日志

说明：
  - 默认使用 docker compose 启动仓库内的 PostgreSQL 16
  - 初始化库包含 sparkflow 和 sparkflow_test
  - 若检测到显式远程 DATABASE_URL / TEST_DATABASE_URL，则 start 会跳过本地 Docker 启动
USAGE
}

docker_compose() {
  docker compose -f "${COMPOSE_FILE}" -p "${COMPOSE_PROJECT}" "$@"
}

ensure_docker_tools() {
  # 检查 Docker 依赖，避免进入脚本后半程才失败。
  if ! command -v docker >/dev/null 2>&1; then
    echo "[postgres-local] docker not found. Please install Docker Desktop first."
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "[postgres-local] docker compose not available."
    exit 1
  fi
}

read_env_file_value() {
  # 从 backend/.env 中读取显式数据库覆盖值，避免误启本地容器。
  local key="$1"
  local env_file="${BACKEND_DIR}/.env"
  if [[ ! -f "${env_file}" ]]; then
    return 0
  fi
  awk -F '=' -v target="${key}" '
    $0 ~ "^[[:space:]]*" target "=" {
      value=substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^["'"'"']|["'"'"']$/, "", value)
      print value
      exit
    }
  ' "${env_file}"
}

resolve_db_url() {
  # 优先读取 shell 环境，其次读取 backend/.env，最后回退默认值。
  local key="$1"
  local fallback="$2"
  local value=""
  if [[ "${key}" == "TEST_DATABASE_URL" ]]; then
    if [[ -n "${TEST_DATABASE_URL+x}" ]]; then
      value="${TEST_DATABASE_URL}"
    else
      value="$(read_env_file_value TEST_DATABASE_URL)"
    fi
  else
    if [[ -n "${DATABASE_URL+x}" ]]; then
      value="${DATABASE_URL}"
    else
      value="$(read_env_file_value DATABASE_URL)"
    fi
  fi
  if [[ -z "${value}" ]]; then
    value="${fallback}"
  fi
  printf '%s\n' "${value}"
}

should_skip_for_target() {
  # 当数据库已经显式指向非默认地址时，跳过本地 Docker PostgreSQL。
  local target="$1"
  local db_url=""
  case "${target}" in
    dev)
      db_url="$(resolve_db_url DATABASE_URL "${DEFAULT_DATABASE_URL}")"
      if [[ "${db_url}" != "${DEFAULT_DATABASE_URL}" ]]; then
        echo "[postgres-local] skip local docker: DATABASE_URL is overridden to ${db_url}"
        return 0
      fi
      ;;
    test)
      db_url="$(resolve_db_url TEST_DATABASE_URL "${DEFAULT_TEST_DATABASE_URL}")"
      if [[ "${db_url}" != "${DEFAULT_TEST_DATABASE_URL}" ]]; then
        echo "[postgres-local] skip local docker: TEST_DATABASE_URL is overridden to ${db_url}"
        return 0
      fi
      ;;
    all)
      if should_skip_for_target dev && should_skip_for_target test; then
        return 0
      fi
      ;;
    *)
      echo "[postgres-local] unknown target: ${target}"
      exit 1
      ;;
  esac
  return 1
}

wait_until_ready() {
  # 等待开发库和测试库都通过 pg_isready，避免后续迁移或 pytest 抢跑。
  local container_id=""
  container_id="$(docker_compose ps -q "${POSTGRES_SERVICE}")"
  if [[ -z "${container_id}" ]]; then
    echo "[postgres-local] postgres container is not running."
    exit 1
  fi
  echo "[postgres-local] waiting for PostgreSQL to become ready..."
  for _ in $(seq 1 30); do
    if docker exec "${container_id}" pg_isready -U sparkflow -d sparkflow >/dev/null 2>&1 \
      && docker exec "${container_id}" pg_isready -U sparkflow -d sparkflow_test >/dev/null 2>&1; then
      echo "[postgres-local] PostgreSQL is ready."
      return
    fi
    sleep 1
  done
  echo "[postgres-local] PostgreSQL readiness timeout."
  exit 1
}

start_postgres() {
  # 幂等启动本地 PostgreSQL 容器。
  local target="${1:-dev}"
  ensure_docker_tools
  if should_skip_for_target "${target}"; then
    return
  fi
  echo "[postgres-local] starting PostgreSQL via docker compose..."
  docker_compose up -d "${POSTGRES_SERVICE}"
  wait_until_ready
}

stop_postgres() {
  # 停止仓库内的 PostgreSQL 容器。
  ensure_docker_tools
  docker_compose stop "${POSTGRES_SERVICE}"
}

show_status() {
  # 输出 PostgreSQL 容器当前状态。
  ensure_docker_tools
  docker_compose ps "${POSTGRES_SERVICE}"
}

show_logs() {
  # 输出最近 PostgreSQL 容器日志，便于排障。
  ensure_docker_tools
  docker_compose logs --tail=200 "${POSTGRES_SERVICE}"
}

case "${MODE}" in
  start)
    start_postgres "${TARGET}"
    ;;
  stop)
    stop_postgres
    ;;
  status)
    show_status
    ;;
  logs)
    show_logs
    ;;
  help|-h|--help)
    print_usage
    ;;
  *)
    echo "[postgres-local] unknown mode: ${MODE}"
    print_usage
    exit 1
    ;;
esac
