# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SparkFlow（灵感编导 AI）- A mobile-first app for knowledge content creators. Core flow: capture voice fragments → AI transcription/summarization → AI script generation → teleprompter recording.

## Tech Stack

| Layer | Technology |
|---|---|
| **Mobile** | Expo 54 + React Native 0.81 + TypeScript + expo-router 6 |
| **Mobile State** | Zustand 5; local truth via expo-sqlite + drizzle-orm |
| **Backend** | FastAPI + SQLAlchemy 2.0 + Alembic + APScheduler + structlog |
| **Database** | PostgreSQL (default, Docker-provided) + ChromaDB (vector DB) |
| **External APIs** | DashScope/Qwen (LLM / STT / Embeddings), Dify (current workflow provider) |

## Architecture

```
Expo Mobile App (React Native)
  ├─ expo-sqlite + drizzle-orm  ← local-first truth for fragments/folders
  ├─ expo-file-system           ← body.html, images, audio staging
  └─ AsyncStorage               ← token, backend URL, device_id
        │ HTTP :8000
FastAPI Backend (Python)
  ├─ modules/*/presentation.py  ← HTTP routers
  ├─ modules/*/application.py   ← orchestration / use cases
  ├─ domains/*/repository.py    ← data access
  ├─ services/*                 ← provider adapters (Dify, DashScope, Qwen, ChromaDB)
  └─ pipeline_runs tables       ← async task source of truth (not Celery/Redis)
```

**Local-first principle**: mobile SQLite/file system is the truth for fragments. The backend is an automatic backup target and explicit recovery source — not the primary store.

## Development Commands

### Full Stack (recommended)

```bash
bash scripts/dev-mobile.sh           # Start PostgreSQL + FastAPI + Expo (LAN mode)
bash scripts/dev-mobile.sh simulator # Use iOS Simulator instead of device
bash scripts/dev-mobile.sh build     # Rebuild iOS native (after native config changes)
```

Equivalent npm aliases: `npm run dev:mobile`, `npm run dev:mobile:simulator`.

### Backend Only

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
.venv/bin/alembic upgrade heads
.venv/bin/uvicorn main:app --reload   # http://localhost:8000
```

Start PostgreSQL separately if needed:
```bash
bash scripts/postgres-local.sh start dev
```

### Tests

```bash
# Full suite (backend + mobile)
bash scripts/test-all.sh       # auto-starts Docker test DB unless TEST_DATABASE_URL is set
npm run test:all

# Backend only
cd backend
.venv/bin/pytest                         # all tests
.venv/bin/pytest -m "not integration"    # smoke/contract only (no PostgreSQL needed)

# Mobile state tests only (Node/TypeScript, no Expo)
node mobile/scripts/run-state-tests.mjs
```

### Networking

- Backend API: `:8000`; Metro bundler: `:8081` — do not mix these up
- Real-device debugging: point app API base URL to `http://<your-lan-ip>:8000`

## Project Structure

```
backend/
├── main.py                  # FastAPI entry point
├── modules/                 # Feature modules (presentation / application layers)
│   ├── fragments/           # Fragment APIs, orchestration, mapper, services
│   ├── scripts/             # Script generation + pipeline definitions
│   ├── pipelines/           # Pipeline status & retry APIs
│   ├── transcriptions/      # Voice upload and transcription
│   ├── backups/             # Auto-backup + explicit restore
│   ├── external_media/      # External link imports (TikTok adapter)
│   ├── knowledge/           # Knowledge base APIs
│   └── shared/              # Pipeline runtime, provider factories, storage, vector store
├── domains/                 # Domain repositories and persistence
├── services/                # Provider adapters (Dify, DashScope, Qwen, ChromaDB, external_media)
├── models/database.py       # Engine / session setup
├── prompts/                 # LLM prompt templates (mode_a_boom.txt, mode_b_brain.txt)
├── alembic/                 # Migrations
└── dify_dsl/                # Dify workflow DSL templates

mobile/
├── app/                     # expo-router file-based pages
├── features/                # Feature hooks, state, API logic (TypeScript source only — no compiled .js/.d.ts)
├── components/              # Shared UI components
├── providers/               # App-level bootstrap (AppSessionProvider, AudioCaptureProvider, etc.)
├── tests/                   # State-only tests (*.test.ts)
└── utils/ constants/ types/ theme/
```

## Core Features

1. **Voice Capture** → POST `/api/transcriptions` → poll `pipeline_run_id` → fragment stored locally + synced
2. **Manual Fragment** → local draft created immediately → background sync via `/api/backups/batch`
3. **AI Script Generation** → select fragments → POST `/api/scripts/generation` → poll `pipeline_run_id`
   - Mode A "导师爆款": enforced structure (hook + pain point + value + CTA)
   - Mode B "专属二脑": mimics user's writing style from knowledge base
4. **Daily Auto-Aggregation** → ≥3 related fragments from yesterday → `daily_push_generation` pipeline run
5. **Teleprompter Recording** → overlay teleprompter on camera → save video to local photos

## Database Schema (Key Tables)

- `fragments` — containers with `transcript`, `summary`, `tags`, `body_markdown`
- `scripts` — generated scripts (mode, status, linked fragment IDs, `body_markdown`)
- `pipeline_runs` / `pipeline_step_runs` — async task source of truth (step retries, external refs)
- `knowledge_docs` — knowledge base docs + vector embeddings
- `media_assets` / `content_media_links` — media file metadata and content references
- `users` — device session auth (RBAC: user/creator roles)

Full schema in `memory-bank/tech-stack.md`.

## Key Conventions

- **Before structural/feature changes**: read `memory-bank/architecture.md` and `memory-bank/PRD.md`
- **After major structural changes**: update `memory-bank/architecture.md`, relevant README, and `AGENTS.md`
- **Layering**: keep presentation / application / domain / service responsibilities separated; no bypassing for convenience
- **Local-first naming**: use `legacy*` / `compat*` for old cloud-binding fields; never introduce new `remote*` / `server*` / `localDraft*` business names
- **Async tasks**: `pipeline_runs` / `pipeline_step_runs` are the only task state; do not reintroduce `agent_runs` or fragment-level task fields
- **New mobile entities** needing remote persistence: hook into `/api/backups/*` + local `entity_version / backup_status` — do not default to "create remote record first"
- **Backend tests**: smoke/contract tests must not connect to PostgreSQL; integration tests (requiring DB) must be marked `@pytest.mark.integration`
- **Backend storage**: PostgreSQL only; no SQLite fallback branches
- **File storage**: use unified object storage abstraction; do not expose disk paths or `storage_path` / `audio_path` as external contracts
- **Mobile state code**: TypeScript source is the single source of truth in `mobile/features/`; do not commit compiled `.js` / `.d.ts` artifacts
- **Comments**: add a brief Chinese comment to every new/modified function describing its responsibility; for non-obvious constraints, also explain the reason (not line-by-line restatement)
- **Modularization**: split expanding logic into focused files before it becomes a monolith
- **`+` button semantics**: opens the import drawer; extend the drawer for new import sources rather than changing the button to a direct navigation
