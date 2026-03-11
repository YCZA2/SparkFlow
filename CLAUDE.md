# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

灵感编导 AI (Inspiration Director) - A mobile app for knowledge content creators that captures voice fragments, generates scripts via backend-managed pipeline workflows, and provides a teleprompter for recording.

## Tech Stack

| Layer | Technology |
|---|---|
| **Mobile** | Expo (React Native) + TypeScript + expo-router |
| **Backend** | FastAPI (Python) + SQLAlchemy + Alembic + APScheduler + structlog + DB-backed pipeline worker |
| **Database** | PostgreSQL (local default) + ChromaDB (vector DB for knowledge base) |
| **External APIs** | DashScope/Qwen (LLM / STT / Embeddings), Workflow provider (current adapter: Dify) |

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Expo (React Native)                │
│  ┌───────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ 录音/相机  │ │ 提词器 UI │ │ AsyncStorage  │  │
│  │ expo-av   │ │ Animated │ │ (本地缓存)     │  │
│  │expo-camera│ │          │ │               │  │
│  └───────────┘ └──────────┘ └───────────────┘  │
└─────────────────────┼───────────────────────────┘
                      │ HTTP localhost:8000
┌─────────────────────┼───────────────────────────┐
│           FastAPI (Python)                      │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ 业务路由  │ │ APScheduler│ │ PostgreSQL    │  │
│  │ Pipeline │ │ Worker     │ │ pipeline_*    │  │
│  └────┬─────┘ └──────────┘ └────────────────┘  │
└───────┼─────────────────────────────────────────┘
        │
┌───────┼─────────────────────────────────────────┐
│    外部 API                                      │
│  ┌──────────┐ ┌──────────────────┐ ┌──────────┐  │
│  │ LLM      │ │ Workflow Provider│ │ Vector DB│  │
│  │          │ │ (current: Dify)  │ │          │  │
│  └──────────┘ └──────────────────┘ └──────────┘  │
└─────────────────────────────────────────────────┘
```

## Development Commands

### Backend Setup & Run
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
.venv/bin/pip install -r requirements.txt
.venv/bin/alembic upgrade heads
.venv/bin/python -m uvicorn main:app --reload   # → http://localhost:8000
```

### Mobile Setup & Run
```bash
cd mobile
npm install
npx expo start --ios        # → Launch iOS Simulator
```

## Project Structure

```
backend/
├── main.py                 # FastAPI entry point
├── modules/                # Modular feature entrypoints
│   ├── fragments/          # Fragment APIs and orchestration
│   │   ├── application.py  # Fragment command/query orchestration
│   │   ├── mapper.py       # Fragment / media response mapping
│   │   └── *_service.py    # Content / derivatives / asset binding internals
│   ├── scripts/            # Script generation and script pipeline definitions
│   ├── pipelines/          # Persistent pipeline APIs
│   ├── knowledge/          # Knowledge base APIs
│   ├── media_assets/       # Unified media asset APIs
│   ├── exports/            # Markdown export APIs
│   ├── transcriptions/     # Voice upload and transcription
│   └── shared/             # Shared ports, container, storage, vector store, providers, media ingestion runtime
├── services/
│   ├── factory.py          # Provider factory
│   ├── dify_workflow_provider.py # Current workflow provider adapter
│   ├── dashscope_stt.py    # Speech-to-text adapter
│   ├── qwen_embedding.py   # Current embedding adapter
│   └── external_media/     # External media providers
├── models/
│   └── database.py         # Engine / session setup
├── prompts/
│   ├── mode_a_boom.txt     # "导师爆款模式" prompt
│   └── mode_b_brain.txt    # "专属二脑模式" prompt
├── alembic/                # Database migrations
├── runtime_logs/           # Runtime logs
└── uploads/                # Local uploaded media

mobile/
├── app/                    # expo-router file-based routing
├── components/             # Reusable UI components
├── features/               # Feature APIs / state / hooks
├── providers/              # App-level bootstrap
└── utils/                  # Utilities
```

## Core Features (User Flow)

1. **Voice Capture** → Record voice → Receive `pipeline_run_id` → Poll task → Stored in fragment library
   - Voice fragments keep machine transcription in `transcript`
   - User-edited body content lives in `fragment_blocks` and is auto-saved from the detail screen
2. **Manual Fragment Capture** → Create text fragment directly in Markdown → Stored in fragment library
   - Manual fragments now require `body_markdown` and no longer write `transcript`
2. **AI Script Generation** → Select multiple fragments → Receive `pipeline_run_id` → Poll task → Generate script
   - Backend assembles structured context, then calls the workflow provider through a shared port
   - Current provider adapter is Dify; script generation is publicly exposed through `/api/scripts/generation` + `/api/pipelines/{run_id}`
   - Script domain no longer depends on any Dify-specific client code directly
   - Mode A: "导师爆款模式" - Forces golden structure (hook + pain point + value + CTA)
   - Mode B: "专属二脑模式" - Mimics user's writing style from knowledge base
3. **Markdown Content Export** → Export fragment / script / knowledge doc as `.md` or batch zip
4. **Daily Auto-Aggregation** → If ≥3 related fragments recorded yesterday → Create `daily_push_generation` pipeline run → Dify workflow generates script
   - Manual triggers use `/api/scripts/daily-push/trigger` and `/api/scripts/daily-push/force-trigger`
   - The trigger endpoints now return `pipeline_run_id`, and the client should poll `/api/pipelines/{run_id}`
   - Fragment summary/tag enrichment still uses direct `llm_provider`; daily-push正文生成已切到 Dify
5. **Teleprompter Recording** → One-tap to camera → Overlay teleprompter → Save video to local photos

## Database Schema (Key Tables)

- `users` - User accounts (with RBAC: user/creator roles)
- `fragments` - Fragment containers (source, summary, tags, `transcript`)
- `fragment_blocks` - Ordered editable fragment content blocks (current v1: Markdown only)
- `scripts` - Generated scripts (mode, status, linked fragment IDs, `body_markdown`)
- `pipeline_runs` - Persistent async pipeline run records
- `pipeline_step_runs` - Step-level execution, retries, and external refs
- `knowledge_docs` - Knowledge base docs (`body_markdown` + vector embeddings)
- `media_assets` / `content_media_links` - Local media file metadata and content references
- `agents` - Creator agents (for future marketplace feature)

See `memory-bank/tech-stack.md` for full SQL schema.

## Key Design Principles

- **Minimal MVP**: No cloud video storage (saves to local photos only), pure native camera without filters
- **PostgreSQL-default**: 本地开发默认使用 PostgreSQL，迁移和测试都与应用配置保持一致
- **Task-source-of-truth**: `pipeline_runs` / `pipeline_step_runs` are the async workflow source of truth
- **Workflow boundary**: backend keeps permissions, retrieval, context assembly, and output validation; workflow provider only handles remote execution
- **Scheduler over Celery**: APScheduler sufficient for daily tasks; no Redis needed
- **Vector DB per user**: Namespace isolation by `user_id` for knowledge base embeddings

## Future Architecture Previews (Pre-reserved)

- Creator marketplace (publish/subscribe agents)
- Floating teleprompter overlay for third-party apps
- Video link analyzer (extract and analyze competitor scripts)

See `memory-bank/PRD.md` section 5 for full预留 requirements.


# IMPORTANT:
# Modularization (multi-file structure), and avoid a single huge file.
# Always read memory-bank/architecture.md before writing any code. Include entire database schema.
# Always read memory-bank/PRD.md before writing any code.
# After adding a major feature or completing a milestone, update memory-bank/architecture.md.
# Always add Chinese comments for each function.
