#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
MOBILE_DIR="${ROOT_DIR}/mobile"
POSTGRES_SCRIPT="${ROOT_DIR}/scripts/postgres-local.sh"

DEFAULT_TEST_DATABASE_URL="postgresql+psycopg://sparkflow:sparkflow@127.0.0.1:5432/sparkflow_test"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-${DATABASE_URL:-${DEFAULT_TEST_DATABASE_URL}}}"


print_header() {
  local message="$1"
  echo
  echo "==> ${message}"
}


ensure_backend_test_deps() {
  # 检查后端测试依赖是否可执行，避免半途失败。
  if [[ ! -x "${BACKEND_DIR}/.venv/bin/pytest" ]]; then
    echo "[test-all] missing backend pytest executable: ${BACKEND_DIR}/.venv/bin/pytest"
    exit 1
  fi
  if [[ ! -f "${POSTGRES_SCRIPT}" ]]; then
    echo "[test-all] postgres helper not found: ${POSTGRES_SCRIPT}"
    exit 1
  fi
}


ensure_mobile_test_deps() {
  # 检查移动端测试命令依赖，避免 npm 环境缺失。
  if ! command -v npm >/dev/null 2>&1; then
    echo "[test-all] npm not found."
    exit 1
  fi
}


run_backend_tests() {
  # 运行后端 PostgreSQL 基线下的全量 pytest。
  print_header "Backend pytest"
  bash "${POSTGRES_SCRIPT}" start test
  (
    cd "${BACKEND_DIR}"
    TEST_DATABASE_URL="${TEST_DATABASE_URL}" .venv/bin/pytest
  )
}


run_mobile_tests() {
  # 运行移动端当前保留的状态测试集。
  print_header "Mobile state tests"
  (
    cd "${MOBILE_DIR}"
    npm run test:state
  )
}


main() {
  # 串行执行全仓测试，任一阶段失败即退出。
  ensure_backend_test_deps
  ensure_mobile_test_deps

  echo "[test-all] TEST_DATABASE_URL=${TEST_DATABASE_URL}"
  run_backend_tests
  run_mobile_tests

  print_header "All tests passed"
}


main "$@"
