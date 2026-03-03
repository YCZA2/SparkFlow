# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

灵感编导 AI (Inspiration Director) - A mobile app for knowledge content creators that captures voice fragments, generates scripts via AI agents, and provides a teleprompter for recording.

## Tech Stack

| Layer | Technology |
|---|---|
| **Mobile** | Expo (React Native) + TypeScript + expo-router + expo-sqlite |
| **Backend** | FastAPI (Python) + SQLAlchemy + APScheduler |
| **Database** | SQLite (local) + Pinecone/Qdrant (vector DB for knowledge base) |
| **External APIs** | OpenAI/Claude (LLM), Whisper (STT), OpenAI Embeddings |

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Expo (React Native)                │
│  ┌───────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ 录音/相机  │ │ 提词器 UI │ │ expo-sqlite   │  │
│  │ expo-av   │ │ Animated │ │ (本地缓存)     │  │
│  │expo-camera│ │          │ │               │  │
│  └───────────┘ └──────────┘ └───────────────┘  │
└─────────────────────┼───────────────────────────┘
                      │ HTTP localhost:8000
┌─────────────────────┼───────────────────────────┐
│           FastAPI (Python)                      │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ 业务路由  │ │ APScheduler│ │ SQLite (主库) │  │
│  └────┬─────┘ └──────────┘ └────────────────┘  │
└───────┼─────────────────────────────────────────┘
        │
┌───────┼─────────────────────────────────────────┐
│    外部 API                                      │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ LLM      │ │ Whisper  │ │ Vector DB      │  │
│  └──────────┘ └──────────┘ └────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Development Commands

### Backend Setup & Run
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn sqlalchemy alembic openai pinecone-client apscheduler python-multipart
uvicorn main:app --reload   # → http://localhost:8000
```

### Mobile Setup & Run
```bash
cd mobile
npx create-expo-app@latest --template tabs
npx expo start --ios        # → Launch iOS Simulator
```

## Project Structure

```
backend/
├── main.py                 # FastAPI entry point
├── routers/
│   ├── fragments.py        # Fragment notes CRUD
│   ├── scripts.py          # AI script generation (dual-agent)
│   ├── knowledge.py        # Knowledge base management
│   └── transcribe.py       # Voice transcription
├── services/
│   ├── llm_service.py      # LLM call wrapper
│   ├── stt_service.py      # Speech-to-text API
│   ├── vector_service.py   # Vector DB operations
│   └── scheduler.py        # APScheduler daily aggregation
├── models/
│   └── db_models.py        # SQLAlchemy models
├── prompts/
│   ├── mode_a_boom.txt     # "导师爆款模式" prompt
│   └── mode_b_brain.txt    # "专属二脑模式" prompt
├── alembic/                # Database migrations
└── data.db                 # SQLite database (gitignored)

mobile/
├── app/                    # expo-router file-based routing
├── components/             # Reusable UI components
├── hooks/                  # Custom React hooks
└── utils/                  # Utilities
```

## Core Features (User Flow)

1. **Voice Capture** → Record voice → AI transcribes + summarizes → Stored in fragment library
2. **AI Script Generation** → Select multiple fragments → Choose agent mode → Generate script
   - Mode A: "导师爆款模式" - Forces golden structure (hook + pain point + value + CTA)
   - Mode B: "专属二脑模式" - Mimics user's writing style from knowledge base
3. **Daily Auto-Aggregation** → If ≥3 related fragments recorded yesterday → AI generates script at 8 AM → Push notification
4. **Teleprompter Recording** → One-tap to camera → Overlay teleprompter → Save video to local photos

## Database Schema (Key Tables)

- `users` - User accounts (with RBAC: user/creator roles)
- `fragments` - Voice notes (transcript, AI summary, auto-tags, source)
- `scripts` - Generated scripts (mode, status, linked fragment IDs)
- `knowledge_docs` - Knowledge base docs (with vector embeddings)
- `agents` - Creator agents (for future marketplace feature)

See `memory-bank/tech-stack.md` for full SQL schema.

## Key Design Principles

- **Minimal MVP**: No cloud video storage (saves to local photos only), pure native camera without filters
- **SQLite-first**: Zero-install database; can migrate to PostgreSQL by changing connection string
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