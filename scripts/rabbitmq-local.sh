#!/usr/bin/env bash

set -euo pipefail

LOCAL_RABBITMQ_HOST="${LOCAL_RABBITMQ_HOST:-127.0.0.1}"
LOCAL_RABBITMQ_PORT="${LOCAL_RABBITMQ_PORT:-5672}"
MODE="${1:-start}"

RABBITMQ_SERVER_BIN=""
RABBITMQ_CTL_BIN=""
BREW_BIN=""

print_usage() {
  cat <<'USAGE'
用法：
  bash scripts/rabbitmq-local.sh start   # 启动本机 RabbitMQ
  bash scripts/rabbitmq-local.sh stop    # 停止本机 RabbitMQ
  bash scripts/rabbitmq-local.sh status  # 查看 RabbitMQ 状态
  bash scripts/rabbitmq-local.sh logs    # 查看 RabbitMQ 日志

说明：
  - 默认使用 Homebrew 安装的 RabbitMQ。
  - 若未安装，请先执行：brew install rabbitmq
  - 本脚本会优先使用 /opt/homebrew/opt/rabbitmq，避免依赖 formula 是否已 link 到 PATH。
USAGE
}

discover_brew() {
  if [[ -n "${BREW_BIN}" ]]; then
    return
  fi
  if command -v brew >/dev/null 2>&1; then
    BREW_BIN="$(command -v brew)"
  fi
}

discover_rabbitmq() {
  local rabbitmq_prefix=""

  if command -v rabbitmq-server >/dev/null 2>&1; then
    RABBITMQ_SERVER_BIN="$(command -v rabbitmq-server)"
  elif [[ -x "/opt/homebrew/opt/rabbitmq/sbin/rabbitmq-server" ]]; then
    RABBITMQ_SERVER_BIN="/opt/homebrew/opt/rabbitmq/sbin/rabbitmq-server"
  elif [[ -x "/usr/local/opt/rabbitmq/sbin/rabbitmq-server" ]]; then
    RABBITMQ_SERVER_BIN="/usr/local/opt/rabbitmq/sbin/rabbitmq-server"
  fi

  if command -v rabbitmqctl >/dev/null 2>&1; then
    RABBITMQ_CTL_BIN="$(command -v rabbitmqctl)"
  elif [[ -x "/opt/homebrew/opt/rabbitmq/sbin/rabbitmqctl" ]]; then
    RABBITMQ_CTL_BIN="/opt/homebrew/opt/rabbitmq/sbin/rabbitmqctl"
  elif [[ -x "/usr/local/opt/rabbitmq/sbin/rabbitmqctl" ]]; then
    RABBITMQ_CTL_BIN="/usr/local/opt/rabbitmq/sbin/rabbitmqctl"
  fi

  if [[ -n "${RABBITMQ_SERVER_BIN}" ]]; then
    rabbitmq_prefix="$(cd "$(dirname "${RABBITMQ_SERVER_BIN}")/.." && pwd)"
    export PATH="${rabbitmq_prefix}/sbin:/opt/homebrew/opt/erlang/bin:/usr/local/opt/erlang/bin:${PATH}"
  fi
}

ensure_rabbitmq_installed() {
  discover_rabbitmq
  if [[ -x "${RABBITMQ_SERVER_BIN}" ]]; then
    return
  fi
  echo "[rabbitmq-local] RabbitMQ not found."
  echo "[rabbitmq-local] Install it first: brew install rabbitmq"
  exit 1
}

is_rabbitmq_listening() {
  lsof -nP -iTCP:"${LOCAL_RABBITMQ_PORT}" -sTCP:LISTEN >/dev/null 2>&1
}

wait_for_rabbitmq() {
  local retries="${1:-30}"
  for _ in $(seq 1 "${retries}"); do
    if is_rabbitmq_listening; then
      echo "[rabbitmq-local] RabbitMQ is ready on ${LOCAL_RABBITMQ_HOST}:${LOCAL_RABBITMQ_PORT}."
      return 0
    fi
    sleep 1
  done
  echo "[rabbitmq-local] RabbitMQ readiness timeout."
  return 1
}

start_rabbitmq() {
  ensure_rabbitmq_installed
  if is_rabbitmq_listening; then
    echo "[rabbitmq-local] RabbitMQ already running on ${LOCAL_RABBITMQ_HOST}:${LOCAL_RABBITMQ_PORT}."
    return
  fi

  discover_brew
  if [[ -n "${BREW_BIN}" ]] && "${BREW_BIN}" list --formula rabbitmq >/dev/null 2>&1; then
    echo "[rabbitmq-local] starting RabbitMQ via Homebrew service..."
    if "${BREW_BIN}" services start rabbitmq >/dev/null 2>&1 && wait_for_rabbitmq 20; then
      return
    fi
    echo "[rabbitmq-local] Homebrew service did not become ready, falling back to detached server."
  fi

  echo "[rabbitmq-local] starting RabbitMQ detached..."
  CONF_ENV_FILE="/opt/homebrew/etc/rabbitmq/rabbitmq-env.conf" "${RABBITMQ_SERVER_BIN}" -detached
  wait_for_rabbitmq 30
}

stop_rabbitmq() {
  discover_rabbitmq
  discover_brew
  if [[ -n "${RABBITMQ_CTL_BIN}" ]]; then
    "${RABBITMQ_CTL_BIN}" stop >/dev/null 2>&1 || true
  fi
  if [[ -n "${BREW_BIN}" ]]; then
    "${BREW_BIN}" services stop rabbitmq >/dev/null 2>&1 || true
  fi
  if is_rabbitmq_listening; then
    echo "[rabbitmq-local] RabbitMQ still listening; stopping listener process."
    lsof -tiTCP:"${LOCAL_RABBITMQ_PORT}" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  fi
}

status_rabbitmq() {
  discover_rabbitmq
  if is_rabbitmq_listening; then
    echo "[rabbitmq-local] server: ready on ${LOCAL_RABBITMQ_HOST}:${LOCAL_RABBITMQ_PORT}"
  else
    echo "[rabbitmq-local] server: not reachable on ${LOCAL_RABBITMQ_HOST}:${LOCAL_RABBITMQ_PORT}"
  fi
  if [[ -n "${RABBITMQ_CTL_BIN}" ]]; then
    "${RABBITMQ_CTL_BIN}" status 2>/dev/null | sed -n '1,20p' || true
  fi
}

logs_rabbitmq() {
  local log_file="/opt/homebrew/var/log/rabbitmq/rabbit@localhost.log"
  if [[ ! -f "${log_file}" ]]; then
    log_file="/usr/local/var/log/rabbitmq/rabbit@localhost.log"
  fi
  if [[ -f "${log_file}" ]]; then
    tail -n 120 -f "${log_file}"
    return
  fi
  echo "[rabbitmq-local] no RabbitMQ log file found."
}

case "${MODE}" in
  start)
    start_rabbitmq
    ;;
  stop)
    stop_rabbitmq
    ;;
  status)
    status_rabbitmq
    ;;
  logs)
    logs_rabbitmq
    ;;
  help|-h|--help)
    print_usage
    ;;
  *)
    echo "[rabbitmq-local] unknown mode: ${MODE}"
    print_usage
    exit 1
    ;;
esac
