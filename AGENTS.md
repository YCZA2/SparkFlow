# AGENTS.md

This file provides repository-specific guidance to coding agents working in this project.

## Project Overview

SparkFlow（灵感编导 AI）是一个面向知识内容创作者的移动端应用，核心流程包括：

- 采集语音灵感片段
- 调用 AI 做转写、摘要与内容生成
- 生成脚本并进入提词录制

当前仓库包含 Expo / React Native 移动端和 FastAPI 后端，默认以本地联调为主。

## Stack

- Mobile: Expo + React Native + TypeScript + expo-router
- Backend: FastAPI + SQLAlchemy + Alembic
- Database: PostgreSQL（本地开发默认由 Docker 提供）
- Scheduling: APScheduler
- AI services: LLM / transcription / vector retrieval adapters in backend services

## Read First

Before making structural or feature changes, read these files first:

1. `memory-bank/PRD.md`
2. `memory-bank/architecture.md`
3. `backend/README.md`
4. `mobile/README.md`

If the change affects architecture, module boundaries, or core flows, update `memory-bank/architecture.md` after finishing.
If the change also updates repository conventions, development workflow, or agent-facing rules, update `AGENTS.md` in the same pass.

## Repository Map

### Root

- `backend/`: FastAPI backend
- `mobile/`: Expo mobile app
- `scripts/dev-mobile.sh`: recommended local dev entrypoint
- `scripts/postgres-local.sh`: 本地 PostgreSQL Docker 管理入口
- `memory-bank/`: product and architecture context
- `CLAUDE.md`: existing Claude-oriented project instructions

### Backend

- `backend/main.py`: FastAPI app entry
- `backend/modules/*`: feature modules, route layer and application orchestration
- `backend/modules/pipelines/`: persistent pipeline status, step query, and retry APIs
- `backend/modules/shared/pipeline_runtime.py`: DB-backed pipeline dispatcher / worker runtime
- `backend/domains/*`: domain repositories and persistence logic
- `backend/services/*`: provider integrations and service implementations
- `backend/models/`: SQLAlchemy models and DB session setup
- `backend/prompts/`: AI prompt templates
- `backend/tests/`: backend tests

### Mobile

- `mobile/app/`: expo-router pages
- `mobile/features/`: feature hooks, state, and API logic
- `mobile/components/`: shared UI components
- `mobile/providers/`: app-level providers and bootstrap logic
- `mobile/constants/`, `mobile/types/`, `mobile/utils/`, `mobile/theme/`: shared client utilities

## Development Workflow

### Preferred local startup

Use the root script instead of manually starting services:

```bash
bash scripts/dev-mobile.sh
```

This starts:

- Docker PostgreSQL on `5432`
- FastAPI backend on `8000`
- Expo / Metro on `8081`

Equivalent npm aliases:

```bash
npm run dev:mobile
npm run dev:mobile:start
```

Manual database operations:

```bash
bash scripts/postgres-local.sh start all
bash scripts/postgres-local.sh status
bash scripts/postgres-local.sh logs
```

### When native iOS changes are involved

If you changed native config, Expo plugins, `app.json`, or files under `mobile/ios`, rebuild first:

```bash
bash scripts/dev-mobile.sh build
```

Then return to normal dev mode:

```bash
bash scripts/dev-mobile.sh
```

### Backend only

From `backend/`:

```bash
uvicorn main:app --reload
```

If you start the backend manually and still use the local default database, start PostgreSQL first:

```bash
bash scripts/postgres-local.sh start dev
```

Run tests with:

```bash
.venv/bin/pytest
```

Run migrations with:

```bash
.venv/bin/alembic upgrade head
```

Run full repository tests from root with:

```bash
bash scripts/test-all.sh
```

This script will automatically ensure the Docker PostgreSQL test database is ready unless `TEST_DATABASE_URL` has been explicitly overridden.

## Mobile/Backend Networking Notes

- App business API address uses port `8000`
- Expo / Metro bundler uses port `8081`
- Do not point the app API base URL to `8081`
- Do not use `8000` as the Metro bundle address

For real-device debugging, the app should use:

```text
http://<your-lan-ip>:8000
```

## Project Conventions

- Prefer modular changes; do not collapse new logic into one large file
- Respect current backend layering: presentation/application/domain/service responsibilities should stay separated
- Treat `pipeline_runs` / `pipeline_step_runs` as the backend task source of truth for async media ingestion and script generation
- Do not reintroduce fragment-level task state compatibility fields or `agent_runs`; task progress must stay on `pipeline_runs` / `pipeline_step_runs`
- Reuse existing scripts and utilities before adding new entrypoints
- Keep comments concise. For every new or modified function, add a brief Chinese comment describing its responsibility or intent; for non-obvious or project-specific logic, also explain the key constraint or reason, but avoid line-by-line restatement of the code
- Avoid broad refactors unless they are required for the task
- Do not introduce structural drift: follow the existing module boundaries, routing shape, and layering instead of bypassing them for convenience
- Do not let files grow into monoliths; when logic, state, or UI keeps expanding, split it into focused modules/components/hooks before it becomes a large single file
- Default backend storage is PostgreSQL only; do not reintroduce SQLite compatibility branches or local SQLite fallback docs
- 文件存储默认通过统一对象存储抽象接入；本地开发可使用 `FILE_STORAGE_PROVIDER=local`，线上默认按私有 OSS + 签名 URL 设计，不要再把磁盘路径或 `storage_path` / `audio_path` 暴露为对外 contract

## When Updating Docs

Update documentation when you change:

- startup or build commands
- architecture or module boundaries
- major user flows
- async task contracts or task status semantics
- environment assumptions for local development
- repository conventions or agent workflow constraints

After any structural change, update the corresponding implementation-facing docs in the same pass, including the relevant README, the matching file under `memory-bank/`, and `AGENTS.md` when conventions or collaboration rules changed.
