# SparkFlow — 推荐技术栈

## 整体架构一览

```
┌─────────────────────────────────────────────────┐
│              Expo (React Native)                │
│         TypeScript · iOS Simulator              │
│  ┌───────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ 录音/相机  │ │ 提词器UI │ │ expo-sqlite   │  │
│  │ expo-av   │ │ Animated │ │ (本地缓存)     │  │
│  │expo-camera│ │          │ │               │  │
│  └───────────┘ └──────────┘ └───────────────┘  │
│                     │ HTTP                      │
└─────────────────────┼───────────────────────────┘
                      │  localhost:8000
┌─────────────────────┼───────────────────────────┐
│           FastAPI (Python)                      │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ 业务路由  │ │ APScheduler│ │ SQLite (主库) │  │
│  │          │ │ (定时聚合) │ │ SQLAlchemy    │  │
│  └────┬─────┘ └──────────┘ └────────────────┘  │
│       │                                         │
└───────┼─────────────────────────────────────────┘
        │ HTTPS
┌───────┼─────────────────────────────────────────┐
│    外部 API (唯三个花钱的地方)                    │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ LLM      │ │ STT      │ │ ChromaDB       │  │
│  │ 阿里/百度 │ │ 阿里/讯飞 │ │ (本地向量库)    │  │
│  │ /智谱    │ │ /百度    │ │                │  │
│  └──────────┘ └──────────┘ └────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 1. 移动端 — Expo (React Native)

| 选型 | 说明 |
|---|---|
| **框架** | **Expo SDK 52+** (Managed Workflow) |
| **语言** | TypeScript |
| **路由** | expo-router（文件系统路由，类 Next.js） |
| **UI 组件** | React Native Paper 或 Tamagui（带主题，开箱即用） |
| **本地数据** | expo-sqlite（碎片笔记离线存储 + 同步队列） |
| **离线同步** | 录音无网络时本地暂存，恢复后自动上传 |

### 关键 Expo 模块直接对应PRD功能

```
expo-av            → 模块1：录音按钮（按住/点击录音）
expo-camera        → 模块3：极简相机（前置/后置切换）
expo-media-library → 模块3：保存视频到系统相册
expo-file-system   → 音频文件暂存后上传后端转写
expo-notifications → 模块2：每日灵感推盘的本地推送
expo-document-picker → 模块4：上传 TXT/Word 喂养知识库
expo-sqlite        → 离线碎片缓存
```

### 为什么选 Expo 而不是纯 Web
- PRD 明确要求**原生相机 + 提词器叠加层 + 存相册**，浏览器做不到流畅体验
- macOS 上 `npx expo start --ios` 直接启动 iOS 模拟器，零额外配置
- Vibe coding 友好：Cursor / Copilot 对 React 代码补全最成熟

---

## 2. 后端 — Python + FastAPI

| 选型 | 说明 |
|---|---|
| **框架** | **FastAPI** |
| **运行** | `uvicorn main:app --reload`，本地 8000 端口 |
| **ORM** | **SQLAlchemy 2.0** + Alembic（数据库迁移） |
| **定时任务** | **APScheduler**（每日8点灵感聚合，无需 Celery） |
| **异步队列预留** | 目前不需要；未来加 `arq` 或 `dramatiq` 即可（PRD第五章提到的异步解析） |

### 为什么选 FastAPI + Python

```
1. 调 LLM/STT/向量 API 的 SDK 全是 Python 一等公民
   - dashscope (阿里通义千问)
   - alibabacloud-nls (阿里云语音识别)
   - chromadb
   - langchain (可选，prompt 管理)

2. 一个 main.py 就能跑起来，vibe coding 最快上手

3. 类型提示 + 自动生成 Swagger 文档，前端联调零沟通成本
```

### 项目结构（建议）

```
backend/
├── main.py                 # FastAPI 入口
├── routers/
│   ├── fragments.py        # 碎片笔记 CRUD
│   ├── scripts.py          # AI合稿（双核Agent）
│   ├── knowledge.py        # 方法论知识库
│   └── transcribe.py       # 语音转写
├── services/
│   ├── llm_service.py      # 统一封装 LLM 调用
│   ├── stt_service.py      # 语音识别 API 封装
│   ├── vector_service.py   # 向量库读写
│   └── scheduler.py        # APScheduler 每日聚合
├── models/
│   └── db_models.py        # SQLAlchemy 模型
├── prompts/
│   ├── mode_a_boom.txt     # 导师爆款模式 Prompt
│   └── mode_b_brain.txt    # 专属二脑模式 Prompt
├── alembic/                # 数据库迁移
├── data.db                 # SQLite 数据库文件
└── requirements.txt
```

---

## 3. 数据库 — SQLite

| 选型 | 说明 |
|---|---|
| **引擎** | **SQLite 3**（macOS 自带，零安装） |
| **文件** | 单文件 `data.db`，git 可以 ignore |
| **ORM** | SQLAlchemy（未来切 PostgreSQL 只改连接字符串） |

### 核心表设计（预留PRD第五章字段）

```sql
-- 用户表（预留 RBAC）
CREATE TABLE users (
    id            TEXT PRIMARY KEY,     -- UUID
    role          TEXT DEFAULT 'user',  -- 'user' | 'creator'  ← PRD预留
    nickname      TEXT,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 碎片笔记表
CREATE TABLE fragments (
    id            TEXT PRIMARY KEY,
    user_id       TEXT REFERENCES users(id),
    audio_path    TEXT,                 -- 本地音频文件路径
    transcript    TEXT,                 -- 转写文本
    summary       TEXT,                 -- AI 一句话摘要
    tags          TEXT,                 -- JSON 数组，AI 自动标签
    source        TEXT DEFAULT 'voice', -- 'voice'|'manual'|'video_parse' ← PRD预留
    sync_status   TEXT DEFAULT 'pending', -- 'pending'|'syncing'|'synced'|'failed'
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 口播稿表
CREATE TABLE scripts (
    id            TEXT PRIMARY KEY,
    user_id       TEXT REFERENCES users(id),
    title         TEXT,
    content       TEXT,                 -- 成稿内容
    mode          TEXT,                 -- 'mode_a' | 'mode_b'
    source_fragment_ids TEXT,           -- JSON 数组，关联碎片ID
    status        TEXT DEFAULT 'draft', -- 'draft'|'ready'|'filmed'
    is_daily_push BOOLEAN DEFAULT 0,   -- 是否每日自动生成
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 知识库文档表（模块4）
CREATE TABLE knowledge_docs (
    id            TEXT PRIMARY KEY,
    user_id       TEXT REFERENCES users(id),
    title         TEXT,
    content       TEXT,
    doc_type      TEXT,                 -- 'high_likes'|'language_habit'
    vector_ref_id TEXT,                 -- 向量库中的引用ID
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Agent表（PRD第五章预留）
CREATE TABLE agents (
    id            TEXT PRIMARY KEY,
    creator_id    TEXT REFERENCES users(id),
    name          TEXT,
    description   TEXT,
    status        TEXT DEFAULT 'private', -- 'private'|'pending'|'published'
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. 外部 API 选型

| 能力 | 推荐方案 | 理由 |
|---|---|---|
| **LLM** | **阿里通义千问**（`qwen-turbo`/`qwen-max`）<br>可切换：百度文心、智谱 AI、DeepSeek | 国内 API 稳定，中文理解能力强，性价比高 |
| **语音转写 STT** | **阿里云语音识别 NLS**（中文场景优化）<br>可切换：讯飞、百度 | 国内语音识别对中文口音支持更好 |
| **向量数据库** | **ChromaDB**（本地，零配置）<br>可切换：Pinecone, Qdrant Cloud | 本地优先零运维，保留抽象接口可无缝切换云服务 |
| **Embedding** | **阿里通义千问 Embedding**（`text-embedding-v2`）<br>可切换：百度、智谱 | 与 LLM 同平台，统一管理，中文向量化效果好 |
| **音频存储** | 后端永久保留（支持未来回放功能） | 原始 `.m4a` 文件长期存储 |

---

## 5. 本地开发环境 & 工具

```bash
# 一次性安装
brew install python@3.12 node watchman
npm install -g expo-cli

# 后端
cd backend
python -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn sqlalchemy alembic dashscope alibabacloud-nls chromadb apscheduler python-multipart
uvicorn main:app --reload   # → http://localhost:8000

# 前端
cd mobile
npx create-expo-app@latest --template tabs
npx expo start --ios        # → 自动启动 iOS 模拟器
```

| 工具 | 用途 |
|---|---|
| **Cursor** | 主力 IDE，AI 写代码 |
| **iOS Simulator** | Xcode 附带，M 系列 Mac 零配置 |
| **DB Browser for SQLite** | 可视化查看 data.db |
| **FastAPI /docs** | 自动生成的 Swagger UI，直接测后端 |

---

## 6. 为什么是这套而不是别的

| 常见替代 | 不选的理由 |
|---|---|
| Flutter | Dart 生态的 AI coding 补全不如 TS/Python |
| Next.js 纯 Web | 原生相机 + 提词器叠加体验做不到 |
| Supabase / Firebase | 你说了要本地跑，云 BaaS 多一层网络依赖 |
| PostgreSQL | MVP 阶段 SQLite 零运维；表结构不变，日后一行改连接串迁移 |
| LangChain 全家桶 | MVP 只需 `openai` SDK + 手写 Prompt，LangChain 太重 |
| Redis / Celery | 定时任务用 APScheduler 足够，不值得加基础设施 |

---

## 7. 一句话总结

> **Expo（React Native）+ FastAPI + SQLite** — 前端一条命令起模拟器，后端一条命令起服务，数据库零安装，三个国内 API（阿里通义千问 LLM + 阿里云 STT + Embedding）统一管理，向量库单独一个 client。整个项目 `git clone` 下来五分钟跑起来。
