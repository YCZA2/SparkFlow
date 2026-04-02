# AGENTS.md

This file provides repository-specific guidance for coding agents working in this project.

## Project Overview

SparkFlow is a mobile-first creation app for knowledge-content creators. The core loop is:

- capture voice or text ideas quickly
- use AI for transcription, summarization, and content generation
- turn source material into scripts and continue into teleprompter-based recording

The repository currently contains an Expo / React Native mobile app and a FastAPI backend. Local development is the default workflow.

## Stack

- Mobile: Expo + React Native + TypeScript + expo-router
- Backend: FastAPI + SQLAlchemy + Alembic
- Database: PostgreSQL, with local development defaulting to a local PostgreSQL service
- Scheduling: APScheduler
- AI services: LLM / transcription / vector retrieval adapters under `backend/services/`

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
- `scripts/dev-mobile.sh`: recommended local development entrypoint
- `scripts/mobile-release.sh`: recommended mobile EAS build / submit entrypoint
- `scripts/postgres-local.sh`: local PostgreSQL bootstrap, status, and logs helper
- `scripts/test-all.sh`: full repository test entrypoint
- `scripts/dify-local.sh`: local self-hosted Dify helper kept for experimental workflow debugging
- `scripts/deploy-backend-aliyun.sh`: backend deployment helper for the current Aliyun production path
- `memory-bank/`: product and architecture context
- `CLAUDE.md`: existing Claude-oriented project instructions

### Backend

- `backend/main.py`: FastAPI app entrypoint and runtime assembly
- `backend/modules/*`: feature modules with presentation / schemas / application layering
- `backend/modules/shared/`: shared infrastructure for ports, providers, storage, media ingestion, content helpers, and pipeline runtime
- `backend/modules/pipelines/`: persistent pipeline status, step query, and retry APIs
- `backend/modules/knowledge/`: knowledge ingestion, chunking, indexing, search, and async processing
- `backend/modules/shared/pipeline/pipeline_runtime.py`: DB-backed pipeline dispatcher / worker runtime
- `backend/domains/*`: domain repositories and persistence logic
- `backend/services/*`: provider integrations and service implementations
- `backend/models/`: SQLAlchemy models and DB session setup
- `backend/prompts/`: backend prompt templates
- `backend/tests/`: backend tests

### Mobile

- `mobile/app/`: expo-router pages
- `mobile/features/`: feature hooks, local stores, sync logic, and API orchestration
- `mobile/components/`: shared UI components
- `mobile/providers/`: app-level providers and bootstrap logic
- `mobile/constants/`, `mobile/types/`, `mobile/utils/`, `mobile/theme/`: shared client utilities
- `mobile/features/core/db/`: local SQLite schema, migrations, and DB runtime
- `mobile/features/core/files/`: local file storage for HTML bodies and staged media
- `mobile/features/editor/`: shared rich-text editor foundation reused by fragments and scripts
- `mobile/app/import-link.tsx`: Douyin share-link import screen
- `mobile/features/imports/`: external-link import requests, payloads, and task-state helpers
- `mobile/app.config.ts`: Expo runtime config entrypoint for app environment, default API address, bundle identity, and developer tools gating
- `mobile/scripts/run-state-tests.mjs`: state-test runner for mobile pure-state suites

## Development Workflow

### Preferred local startup

Use the root script instead of manually starting services:

```bash
bash scripts/dev-mobile.sh
```

This starts:

- local PostgreSQL on `5432`
- FastAPI backend on `8000`
- Expo / Metro on `8081`

Equivalent npm aliases:

```bash
npm run dev:mobile
npm run dev:mobile:start
```

Additional local modes:

```bash
npm run dev:mobile:simulator
npm run dev:mobile:web
```

Manual database operations:

```bash
bash scripts/postgres-local.sh start all
bash scripts/postgres-local.sh status
bash scripts/postgres-local.sh logs
```

### When native iOS changes are involved

If you changed native config, Expo plugins, `mobile/app.config.ts`, or files under `mobile/ios`, rebuild first:

```bash
bash scripts/dev-mobile.sh build
```

If build already succeeded but device installation failed, retry install without rebuilding:

```bash
bash scripts/dev-mobile.sh install
```

Then return to normal dev mode:

```bash
bash scripts/dev-mobile.sh
```

### Backend only

From `backend/`:

```bash
APP_ENV=development uvicorn main:app --reload --no-access-log
```

If you start the backend manually and still use the local default database, start PostgreSQL first:

```bash
bash scripts/postgres-local.sh start dev
```

Run tests with:

```bash
.venv/bin/pytest
```

Run the lightweight backend suite without PostgreSQL with:

```bash
.venv/bin/pytest -m "not integration"
```

Run migrations with:

```bash
.venv/bin/alembic upgrade heads
```

Run full repository tests from root with:

```bash
bash scripts/test-all.sh
```

This script automatically ensures the local PostgreSQL test database is ready unless `TEST_DATABASE_URL` has been explicitly overridden.

## Mobile/Backend Networking Notes

- The app business API uses port `8000`
- Expo / Metro uses port `8081`
- Do not point the app API base URL to `8081`
- Do not use `8000` as the Metro bundle address

For real-device debugging, the app API should use:

```text
http://<your-lan-ip>:8000
```

## Project Conventions

- Prefer modular changes; do not collapse new logic into a single large file
- Respect current backend layering: presentation / application / domain / service responsibilities must stay separated
- `fragments`, `folders`, and `scripts` are evolving under a local-first plus backup/recovery model; assume mobile SQLite and local files are the source of truth, while the backend handles backup, restore, AI execution, and compatible projections
- `fragment` and `script` are separate domain entities: fragments are source material, scripts are derived outputs; they may share the editor foundation, `body_html`, backup infrastructure, exports, and media helpers, but they must not be merged into one business entity
- `script.source_fragment_ids` only records the original generation sources; scripts must not re-enter fragment retrieval, clustering, daily-push input selection, or future script-generation input
- For legacy cache, legacy cloud binding, or legacy body-draft compatibility code, use `legacy*` or `compat*` naming; do not add new business names such as `remote*`, `server*`, or `localDraft*` that imply the old remote-first model is still current
- Treat `pipeline_runs` and `pipeline_step_runs` as the backend source of truth for async media ingestion, knowledge ingestion, daily push, and script generation tasks
- Do not reintroduce fragment-level task-state compatibility fields or `agent_runs`; task progress must stay on `pipeline_runs` and `pipeline_step_runs`
- When adding new mobile entities that need remote persistence, integrate with `/api/backups/*` and local `entity_version` / `backup_status` first; do not default to “create a backend business row first”
- Reuse existing scripts and utilities before adding new entrypoints
- Reuse `scripts/mobile-release.sh` and the existing npm aliases for mobile build / submission flows instead of duplicating EAS profile names, platform flags, or `APP_ENV` mappings in new docs or scripts
- Environment configuration is intentionally limited to `development` and `production`: the backend uses `APP_ENV + .env/.env.<env>`, and the mobile app uses Expo runtime config; do not leak fixed LAN addresses, debug-only entrypoints, or manual network overrides into production behavior
- If a change alters product behavior, user-facing flows, API contracts, operational steps, or development workflow, you must update the corresponding documentation in the same pass. Before editing docs, scan the existing Markdown files in the relevant area such as root docs, `memory-bank/`, and feature-level `README.md` files so the change lands in the right source of truth instead of creating drift or duplicate guidance
- Backend tests must stay layered: smoke / contract tests that do not need DB access or startup side effects should avoid PostgreSQL by default, while tests that depend on `db_session_factory`, `app`, `async_client`, or real lifespan behavior must be marked `integration`
- Keep comments concise. Every function must have a brief Chinese comment describing its responsibility or intent; for non-obvious or project-specific logic, also explain the key constraint or reason, but avoid line-by-line restatement
- Avoid broad refactors unless they are required for the task
- Do not introduce structural drift: follow the existing module boundaries, routing shape, and layering instead of bypassing them for convenience
- Do not let files grow into monoliths; when logic, state, or UI keeps expanding, split it into focused modules, components, or hooks before it becomes a large single file
- Default backend persistence is PostgreSQL only; do not reintroduce SQLite compatibility branches or local SQLite fallback docs on the server side
- File storage must continue through the unified object-storage abstraction; local development may use `FILE_STORAGE_PROVIDER=local`, while production is designed around private OSS plus signed URLs. Do not expose disk paths or `storage_path` / `audio_path` as external contract fields
- The bottom `+` action on the home screen and folder screen means “open the import sheet”; when adding external import abilities, extend that sheet instead of reverting `+` to direct navigation
- Under `mobile/features`, TypeScript source files are the only source of truth for state helpers. Do not commit `.js` or `.d.ts` build output there. Pure state tests belong in `mobile/tests/*.test.ts` and run through `mobile/scripts/run-state-tests.mjs`
- The shipping product is now an authenticated workspace app: unauthenticated users must not enter business screens, and the mobile local SQLite DB, body files, audio cache, image staging, and backup queue must all be isolated by `user_id`
- Any async task that writes back to local SQLite or the file system must be bound to the current `user_id + session_version + workspace_epoch` scope; after account switch, logout, or session invalidation, old tasks may only remain frozen in their original workspace and must not write into the current account
- `POST /api/auth/token` is only for local development and testing. The shipping login flow uses email + password authentication, and auth-related work must not restore the old “auto-enter with a test user” behavior

## When Updating Docs

Update documentation when you change:

- behavior, user flows, feature scope, or API semantics
- startup or build commands
- architecture or module boundaries
- major user flows
- async task contracts or task-status semantics
- environment assumptions for local development
- repository conventions or agent workflow constraints

Before updating docs, scan the existing Markdown files in the affected area and prefer updating the current source-of-truth document instead of adding a new disconnected note. After any structural or functional change, update the corresponding implementation-facing docs in the same pass, including the relevant README, the matching file under `memory-bank/`, and `AGENTS.md` when conventions or collaboration rules changed.
