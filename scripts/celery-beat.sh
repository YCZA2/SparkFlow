#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"

APP_ENV="${APP_ENV:-development}"
CELERY_BROKER_URL="${CELERY_BROKER_URL:-amqp://guest:guest@127.0.0.1:5672//}"
CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND:-rpc://}"
CELERY_BEAT_LOGLEVEL="${CELERY_BEAT_LOGLEVEL:-INFO}"
CELERY_BEAT_SCHEDULE_FILE="${CELERY_BEAT_SCHEDULE_FILE:-${BACKEND_DIR}/runtime/celerybeat-schedule}"

CELERY_BIN=""

if [[ -x "${BACKEND_DIR}/.venv/bin/celery" ]]; then
  CELERY_BIN="${BACKEND_DIR}/.venv/bin/celery"
elif command -v celery >/dev/null 2>&1; then
  CELERY_BIN="$(command -v celery)"
else
  echo "[celery-beat] celery not found. Install backend dependencies first:"
  echo "[celery-beat]   backend/.venv/bin/pip install -r backend/requirements.txt"
  exit 1
fi

mkdir -p "$(dirname "${CELERY_BEAT_SCHEDULE_FILE}")"
cd "${BACKEND_DIR}"

exec env \
  APP_ENV="${APP_ENV}" \
  CELERY_BROKER_URL="${CELERY_BROKER_URL}" \
  CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND}" \
  CELERY_TASK_ALWAYS_EAGER=false \
  PYTHONPATH=. \
  "${CELERY_BIN}" -A celery_app:celery_app beat \
    --schedule="${CELERY_BEAT_SCHEDULE_FILE}" \
    --loglevel="${CELERY_BEAT_LOGLEVEL}"
