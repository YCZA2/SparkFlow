#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
MOBILE_DIR="${ROOT_DIR}/mobile"

BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
EXPO_PORT="${EXPO_PORT:-8081}"

BACKEND_PID=""
EXPO_PID=""

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
  echo
  echo "[dev-mobile] stopping processes..."
  if [[ -n "${EXPO_PID}" ]]; then
    kill "${EXPO_PID}" 2>/dev/null || true
  fi
  if [[ -n "${BACKEND_PID}" ]]; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if [[ ! -d "${BACKEND_DIR}" || ! -d "${MOBILE_DIR}" ]]; then
  echo "[dev-mobile] backend/ or mobile/ directory not found."
  exit 1
fi

if [[ -x "${BACKEND_DIR}/.venv/bin/python" ]]; then
  BACKEND_PYTHON="${BACKEND_DIR}/.venv/bin/python"
else
  BACKEND_PYTHON="python3"
fi

if ! command -v "${BACKEND_PYTHON}" >/dev/null 2>&1; then
  echo "[dev-mobile] python not found: ${BACKEND_PYTHON}"
  exit 1
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "[dev-mobile] npx not found. Please install Node.js first."
  exit 1
fi

LOCAL_IP="$(get_local_ip)"
PUBLIC_BACKEND_URL="http://${LOCAL_IP}:${BACKEND_PORT}"
LOCAL_BACKEND_HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/health"

echo "[dev-mobile] starting backend..."
(
  cd "${BACKEND_DIR}"
  exec "${BACKEND_PYTHON}" -m uvicorn main:app --host "${BACKEND_HOST}" --port "${BACKEND_PORT}" --reload
) &
BACKEND_PID=$!

echo "[dev-mobile] waiting backend health check: ${LOCAL_BACKEND_HEALTH_URL}"
BACKEND_READY=0
for _ in $(seq 1 30); do
  if curl -fsS "${LOCAL_BACKEND_HEALTH_URL}" >/dev/null 2>&1; then
    BACKEND_READY=1
    break
  fi
  sleep 1
done

if [[ "${BACKEND_READY}" -ne 1 ]]; then
  echo "[dev-mobile] backend health check timeout, but continue to start mobile."
fi

echo "[dev-mobile] starting expo (LAN mode)..."
(
  cd "${MOBILE_DIR}"
  exec npx expo start --lan --port "${EXPO_PORT}"
) &
EXPO_PID=$!

echo
echo "========================================"
echo "SparkFlow dev started for real device"
echo "Backend (mobile should use this): ${PUBLIC_BACKEND_URL}"
echo "Backend local health: ${LOCAL_BACKEND_HEALTH_URL}"
echo "Expo DevTools: http://localhost:${EXPO_PORT}"
echo "Tip: if auto-discovery fails, set backend URL manually in app network settings."
echo "Press Ctrl+C to stop both backend and mobile."
echo "========================================"
echo

wait "${EXPO_PID}"
