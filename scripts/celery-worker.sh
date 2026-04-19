#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"

APP_ENV="${APP_ENV:-development}"
CELERY_BROKER_URL="${CELERY_BROKER_URL:-amqp://guest:guest@127.0.0.1:5672//}"
CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND:-rpc://}"
CELERY_WORKER_QUEUES="${CELERY_WORKER_QUEUES:-transcription,fragment-derivative,document-import,script-generation,knowledge-processing,daily-push,default}"
CELERY_WORKER_POOL="${CELERY_WORKER_POOL:-solo}"
CELERY_WORKER_CONCURRENCY="${CELERY_WORKER_CONCURRENCY:-1}"
CELERY_WORKER_LOGLEVEL="${CELERY_WORKER_LOGLEVEL:-INFO}"

CELERY_BIN=""

if [[ -x "${BACKEND_DIR}/.venv/bin/celery" ]]; then
  CELERY_BIN="${BACKEND_DIR}/.venv/bin/celery"
elif command -v celery >/dev/null 2>&1; then
  CELERY_BIN="$(command -v celery)"
else
  echo "[celery-worker] celery not found. Install backend dependencies first:"
  echo "[celery-worker]   backend/.venv/bin/pip install -r backend/requirements.txt"
  exit 1
fi

cd "${BACKEND_DIR}"

exec env \
  APP_ENV="${APP_ENV}" \
  CELERY_BROKER_URL="${CELERY_BROKER_URL}" \
  CELERY_RESULT_BACKEND="${CELERY_RESULT_BACKEND}" \
  CELERY_TASK_ALWAYS_EAGER=false \
  PYTHONPATH=. \
  "${CELERY_BIN}" -A celery_app:celery_app worker \
    -Q "${CELERY_WORKER_QUEUES}" \
    --pool="${CELERY_WORKER_POOL}" \
    --concurrency="${CELERY_WORKER_CONCURRENCY}" \
    --loglevel="${CELERY_WORKER_LOGLEVEL}"
