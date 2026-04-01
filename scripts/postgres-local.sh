#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
DEFAULT_DATABASE_URL="postgresql+psycopg://sparkflow:sparkflow@127.0.0.1:5432/sparkflow"
DEFAULT_TEST_DATABASE_URL="postgresql+psycopg://sparkflow:sparkflow@127.0.0.1:5432/sparkflow_test"
LOCAL_DB_HOST="${LOCAL_DB_HOST:-127.0.0.1}"
LOCAL_DB_PORT="${LOCAL_DB_PORT:-5432}"
APP_DB_USER="${APP_DB_USER:-sparkflow}"
APP_DB_PASSWORD="${APP_DB_PASSWORD:-sparkflow}"
DEV_DB_NAME="${DEV_DB_NAME:-sparkflow}"
TEST_DB_NAME="${TEST_DB_NAME:-sparkflow_test}"
MODE="${1:-start}"
TARGET="${2:-dev}"

PSQL_BIN=""
PG_ISREADY_BIN=""
BREW_BIN=""
BREW_FORMULA=""

print_usage() {
  cat <<'USAGE'
用法：
  bash scripts/postgres-local.sh start [dev|test|all]    # 检查本机 PostgreSQL，并初始化默认开发/测试库
  bash scripts/postgres-local.sh stop                    # 停止 Homebrew 管理的本机 PostgreSQL 服务
  bash scripts/postgres-local.sh status                  # 查看本机 PostgreSQL 与默认库状态
  bash scripts/postgres-local.sh logs                    # 查看本机 PostgreSQL 最近日志

说明：
  - 默认使用本机 PostgreSQL 服务（推荐 macOS + Homebrew）
  - 默认初始化 sparkflow 和 sparkflow_test，并确保 sparkflow 账号可登录
  - 若检测到显式远程 DATABASE_URL / TEST_DATABASE_URL，则 start 会跳过本机默认库初始化
  - 如需指定用于建库的管理员账号，可设置 POSTGRES_SUPERUSER=<your-local-superuser>
USAGE
}

read_env_file_value() {
  # 从 backend/.env 中读取显式数据库覆盖值，避免误操作非默认数据库。
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
  # 当数据库已显式指向非默认地址时，跳过本机默认库初始化。
  local target="$1"
  local db_url=""
  case "${target}" in
    dev)
      db_url="$(resolve_db_url DATABASE_URL "${DEFAULT_DATABASE_URL}")"
      if [[ "${db_url}" != "${DEFAULT_DATABASE_URL}" ]]; then
        echo "[postgres-local] skip local bootstrap: DATABASE_URL is overridden to ${db_url}"
        return 0
      fi
      ;;
    test)
      db_url="$(resolve_db_url TEST_DATABASE_URL "${DEFAULT_TEST_DATABASE_URL}")"
      if [[ "${db_url}" != "${DEFAULT_TEST_DATABASE_URL}" ]]; then
        echo "[postgres-local] skip local bootstrap: TEST_DATABASE_URL is overridden to ${db_url}"
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

discover_brew() {
  # 记录 brew 可执行路径，供自动拉起本机 PostgreSQL 服务复用。
  if [[ -n "${BREW_BIN}" ]]; then
    return
  fi
  if command -v brew >/dev/null 2>&1; then
    BREW_BIN="$(command -v brew)"
  fi
}

discover_brew_formula() {
  # 优先选择已安装的 PostgreSQL Homebrew formula，便于统一启停和查日志。
  local formula=""
  discover_brew
  if [[ -n "${BREW_FORMULA}" || -z "${BREW_BIN}" ]]; then
    return
  fi
  formula="$("${BREW_BIN}" list --formula 2>/dev/null | awk '/^postgresql(@[0-9]+)?$/{print}' | sort -Vr | head -n 1)"
  if [[ -n "${formula}" ]]; then
    BREW_FORMULA="${formula}"
  fi
}

find_postgres_tool() {
  # 按 PATH、当前 Homebrew formula 与常见安装目录定位 PostgreSQL 客户端命令。
  local tool="$1"
  local candidate=""
  local formula=""

  if command -v "${tool}" >/dev/null 2>&1; then
    command -v "${tool}"
    return 0
  fi

  discover_brew_formula
  if [[ -n "${BREW_FORMULA}" ]]; then
    for candidate in \
      "/opt/homebrew/opt/${BREW_FORMULA}/bin/${tool}" \
      "/usr/local/opt/${BREW_FORMULA}/bin/${tool}"
    do
      if [[ -x "${candidate}" ]]; then
        printf '%s\n' "${candidate}"
        return 0
      fi
    done
  fi

  for formula in postgresql@17 postgresql@16 postgresql@15 postgresql@14 postgresql; do
    for candidate in \
      "/opt/homebrew/opt/${formula}/bin/${tool}" \
      "/usr/local/opt/${formula}/bin/${tool}"
    do
      if [[ -x "${candidate}" ]]; then
        printf '%s\n' "${candidate}"
        return 0
      fi
    done
  done

  return 1
}

ensure_postgres_client_tools() {
  # 确保 psql / pg_isready 可用，否则直接给出本机安装提示。
  if [[ -z "${PSQL_BIN}" ]]; then
    PSQL_BIN="$(find_postgres_tool psql || true)"
  fi
  if [[ -z "${PG_ISREADY_BIN}" ]]; then
    PG_ISREADY_BIN="$(find_postgres_tool pg_isready || true)"
  fi

  if [[ -n "${PSQL_BIN}" && -n "${PG_ISREADY_BIN}" ]]; then
    return
  fi

  echo "[postgres-local] PostgreSQL client tools not found."
  echo "[postgres-local] Install a local PostgreSQL first, for example:"
  echo "  brew install postgresql@16"
  echo "  brew services start postgresql@16"
  exit 1
}

wait_for_server_ready() {
  # 等待本机 PostgreSQL TCP 端口就绪，避免后续迁移和测试抢跑。
  echo "[postgres-local] waiting for local PostgreSQL on ${LOCAL_DB_HOST}:${LOCAL_DB_PORT}..."
  for _ in $(seq 1 30); do
    if "${PG_ISREADY_BIN}" -h "${LOCAL_DB_HOST}" -p "${LOCAL_DB_PORT}" >/dev/null 2>&1; then
      echo "[postgres-local] PostgreSQL is ready."
      return 0
    fi
    sleep 1
  done
  echo "[postgres-local] PostgreSQL readiness timeout."
  return 1
}

maybe_start_brew_service() {
  # 若当前机器通过 Homebrew 安装过 PostgreSQL，则尝试自动拉起本机服务。
  discover_brew_formula
  if [[ -z "${BREW_BIN}" || -z "${BREW_FORMULA}" ]]; then
    return 1
  fi
  echo "[postgres-local] starting local PostgreSQL via Homebrew: ${BREW_FORMULA}"
  "${BREW_BIN}" services start "${BREW_FORMULA}" >/dev/null
  return 0
}

ensure_local_server_running() {
  # 优先连接现有本机 PostgreSQL，不可用时再尝试启动 Homebrew 服务。
  ensure_postgres_client_tools
  if "${PG_ISREADY_BIN}" -h "${LOCAL_DB_HOST}" -p "${LOCAL_DB_PORT}" >/dev/null 2>&1; then
    return 0
  fi
  if ! maybe_start_brew_service; then
    echo "[postgres-local] no running local PostgreSQL detected on ${LOCAL_DB_HOST}:${LOCAL_DB_PORT}."
    echo "[postgres-local] Start your local PostgreSQL service first, or install one via Homebrew."
    echo "[postgres-local] Example:"
    echo "  brew install postgresql@16"
    echo "  brew services start postgresql@16"
    exit 1
  fi
  wait_for_server_ready
}

admin_user() {
  # 默认使用当前系统用户作为本机 PostgreSQL 管理员，可通过 POSTGRES_SUPERUSER 覆盖。
  printf '%s\n' "${POSTGRES_SUPERUSER:-${USER:-postgres}}"
}

run_admin_sql() {
  # 使用本机管理员账号执行建角/建库 SQL，失败时给出明确补救提示。
  local sql="$1"
  local admin
  admin="$(admin_user)"
  if ! "${PSQL_BIN}" -v ON_ERROR_STOP=1 -U "${admin}" -d postgres -c "${sql}" >/dev/null 2>&1; then
    echo "[postgres-local] failed to execute admin SQL with role '${admin}'."
    echo "[postgres-local] If your local superuser is different, rerun with POSTGRES_SUPERUSER=<role>."
    echo "[postgres-local] You may also need to log in as a PostgreSQL superuser and bootstrap ${APP_DB_USER}/${DEV_DB_NAME} manually."
    exit 1
  fi
}

ensure_app_role() {
  # 保证应用默认账号存在，并对本地开发固定口令做幂等同步。
  run_admin_sql "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_DB_USER}') THEN CREATE ROLE ${APP_DB_USER} LOGIN PASSWORD '${APP_DB_PASSWORD}'; ELSE ALTER ROLE ${APP_DB_USER} WITH LOGIN PASSWORD '${APP_DB_PASSWORD}'; END IF; END \$\$;"
}

database_exists() {
  # 通过本机管理员账号检查数据库是否已经存在。
  local database_name="$1"
  local admin
  admin="$(admin_user)"
  [[ "$("${PSQL_BIN}" -U "${admin}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${database_name}'" 2>/dev/null || true)" == "1" ]]
}

ensure_database_exists() {
  # 幂等创建默认开发/测试数据库，并把所有权交给应用账号。
  local database_name="$1"
  if database_exists "${database_name}"; then
    return 0
  fi
  echo "[postgres-local] creating database: ${database_name}"
  run_admin_sql "CREATE DATABASE ${database_name} OWNER ${APP_DB_USER};"
}

can_connect_as_app_user() {
  # 使用应用默认连接串做真实连接校验，确保迁移和 pytest 可直接复用。
  local database_name="$1"
  PGPASSWORD="${APP_DB_PASSWORD}" "${PSQL_BIN}" \
    -h "${LOCAL_DB_HOST}" \
    -p "${LOCAL_DB_PORT}" \
    -U "${APP_DB_USER}" \
    -d "${database_name}" \
    -tAc "SELECT 1" >/dev/null 2>&1
}

wait_until_target_ready() {
  # 等待目标库可被应用账号正常连接，避免后续 Alembic / pytest 抢跑。
  local target="$1"
  local databases=()
  case "${target}" in
    dev)
      databases=("${DEV_DB_NAME}")
      ;;
    test)
      databases=("${TEST_DB_NAME}")
      ;;
    all)
      databases=("${DEV_DB_NAME}" "${TEST_DB_NAME}")
      ;;
    *)
      echo "[postgres-local] unknown target: ${target}"
      exit 1
      ;;
  esac

  echo "[postgres-local] verifying target databases: ${databases[*]}"
  for _ in $(seq 1 30); do
    local ready=1
    local database_name=""
    for database_name in "${databases[@]}"; do
      if ! can_connect_as_app_user "${database_name}"; then
        ready=0
        break
      fi
    done
    if [[ "${ready}" -eq 1 ]]; then
      echo "[postgres-local] target databases are ready."
      return 0
    fi
    sleep 1
  done

  echo "[postgres-local] failed to connect using ${APP_DB_USER}@${LOCAL_DB_HOST}:${LOCAL_DB_PORT}."
  echo "[postgres-local] Check local PostgreSQL auth settings and make sure password auth is enabled for TCP localhost."
  exit 1
}

bootstrap_target() {
  # 按目标初始化默认库，保持 dev/test 入口语义与旧脚本一致。
  local target="$1"
  ensure_app_role
  case "${target}" in
    dev)
      ensure_database_exists "${DEV_DB_NAME}"
      ;;
    test)
      ensure_database_exists "${TEST_DB_NAME}"
      ;;
    all)
      ensure_database_exists "${DEV_DB_NAME}"
      ensure_database_exists "${TEST_DB_NAME}"
      ;;
    *)
      echo "[postgres-local] unknown target: ${target}"
      exit 1
      ;;
  esac
}

start_postgres() {
  # 本地联调默认确保 PostgreSQL 服务可用，并初始化默认开发/测试库。
  local target="${1:-dev}"
  if should_skip_for_target "${target}"; then
    return 0
  fi
  ensure_local_server_running
  bootstrap_target "${target}"
  wait_until_target_ready "${target}"
}

stop_postgres() {
  # 优先停止 Homebrew 托管的 PostgreSQL 服务，未托管时只给出提示。
  discover_brew_formula
  if [[ -z "${BREW_BIN}" || -z "${BREW_FORMULA}" ]]; then
    echo "[postgres-local] no Homebrew-managed PostgreSQL formula found."
    echo "[postgres-local] Stop your local PostgreSQL service manually if needed."
    return 0
  fi
  echo "[postgres-local] stopping Homebrew PostgreSQL: ${BREW_FORMULA}"
  "${BREW_BIN}" services stop "${BREW_FORMULA}" >/dev/null
}

show_status() {
  # 输出本机 PostgreSQL 与默认开发/测试库连通性，便于联调前自检。
  ensure_postgres_client_tools
  discover_brew_formula

  if "${PG_ISREADY_BIN}" -h "${LOCAL_DB_HOST}" -p "${LOCAL_DB_PORT}" >/dev/null 2>&1; then
    echo "[postgres-local] server: ready on ${LOCAL_DB_HOST}:${LOCAL_DB_PORT}"
  else
    echo "[postgres-local] server: not reachable on ${LOCAL_DB_HOST}:${LOCAL_DB_PORT}"
  fi

  if can_connect_as_app_user "${DEV_DB_NAME}"; then
    echo "[postgres-local] database ${DEV_DB_NAME}: ready"
  else
    echo "[postgres-local] database ${DEV_DB_NAME}: unavailable"
  fi

  if can_connect_as_app_user "${TEST_DB_NAME}"; then
    echo "[postgres-local] database ${TEST_DB_NAME}: ready"
  else
    echo "[postgres-local] database ${TEST_DB_NAME}: unavailable"
  fi

  if [[ -n "${BREW_BIN}" && -n "${BREW_FORMULA}" ]]; then
    echo "[postgres-local] brew service:"
    "${BREW_BIN}" services list | awk -v target="${BREW_FORMULA}" 'NR == 1 || $1 == target { print }'
  fi
}

show_logs() {
  # 尝试读取 Homebrew / 本机 PostgreSQL 常见日志路径，找不到时给出排障提示。
  local candidate=""
  local candidates=()

  discover_brew_formula
  if [[ -n "${BREW_FORMULA}" ]]; then
    candidates+=(
      "${HOME}/Library/Logs/Homebrew/${BREW_FORMULA}.log"
      "/opt/homebrew/var/log/${BREW_FORMULA}.log"
      "/usr/local/var/log/${BREW_FORMULA}.log"
    )
  fi
  candidates+=(
    "${HOME}/Library/Logs/Homebrew/postgresql.log"
    "/opt/homebrew/var/log/postgres.log"
    "/opt/homebrew/var/log/postgresql.log"
    "/usr/local/var/log/postgres.log"
    "/usr/local/var/log/postgresql.log"
  )

  for candidate in "${candidates[@]}"; do
    if [[ -f "${candidate}" ]]; then
      echo "[postgres-local] tailing ${candidate}"
      tail -n 200 "${candidate}"
      return 0
    fi
  done

  echo "[postgres-local] no known local PostgreSQL log file found."
  echo "[postgres-local] If you installed via Homebrew, run 'brew services list' and inspect the data dir / log config of your formula."
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
