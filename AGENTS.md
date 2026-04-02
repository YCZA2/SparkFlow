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
- Database: PostgreSQL（本地开发默认使用本机 PostgreSQL 服务）
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
- `scripts/mobile-release.sh`: recommended mobile EAS build / submit entrypoint
- `scripts/postgres-local.sh`: 本机 PostgreSQL 服务检查与默认库初始化入口
- `memory-bank/`: product and architecture context
- `CLAUDE.md`: existing Claude-oriented project instructions

### Backend

- `backend/main.py`: FastAPI app entry
- `backend/modules/*`: feature modules, route layer and application orchestration
- `backend/modules/pipelines/`: persistent pipeline status, step query, and retry APIs
- `backend/modules/shared/pipeline/pipeline_runtime.py`: DB-backed pipeline dispatcher / worker runtime
- `backend/domains/*`: domain repositories and persistence logic
- `backend/services/*`: provider integrations and service implementations
- `backend/models/`: SQLAlchemy models and DB session setup
- `backend/dify_dsl/`: Dify workflow DSL templates for script generation
- `backend/tests/`: backend tests

### Mobile

- `mobile/app/`: expo-router pages
- `mobile/features/`: feature hooks, state, and API logic
- `mobile/components/`: shared UI components
- `mobile/providers/`: app-level providers and bootstrap logic
- `mobile/constants/`, `mobile/types/`, `mobile/utils/`, `mobile/theme/`: shared client utilities
- `mobile/app/import-link.tsx`: 抖音分享链接导入页
- `mobile/features/imports/`: 外部链接导入请求、载荷与任务态辅助逻辑
- `mobile/app.config.ts`: Expo runtime config 入口；dev/prod 包标识、默认 API 地址和开发工具开关都从这里下发

## Development Workflow

### Preferred local startup

Use the root script instead of manually starting services:

```bash
bash scripts/dev-mobile.sh
```

This starts:

- Local PostgreSQL on `5432`
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

If you changed native config, Expo plugins, `mobile/app.config.ts`, or files under `mobile/ios`, rebuild first:

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

This script will automatically ensure the local PostgreSQL test database is ready unless `TEST_DATABASE_URL` has been explicitly overridden.

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
- 当前 fragments / folders / scripts 正在向 **local-first + backup/recovery** 演进；默认假设移动端本地 SQLite / 文件系统是真值，远端只负责自动备份与显式恢复
- `fragment` 与 `script` 是两个独立领域对象：fragment 是素材池，script 是派生成稿；两者可以共享 editor / `body_html` / backup 基础设施，但不要把它们合并成统一业务实体
- `script.source_fragment_ids` 只表示首次生成来源；不要让 script 重新进入 fragment 检索、聚类、每日推盘选材或再生成输入
- 处理旧缓存、旧云端绑定或旧正文草稿兼容层时，命名统一使用 `legacy*` / `compat*`；不要再新增会让人误以为远端仍是主真值的 `remote*` / `server*` / `localDraft*` 业务命名
- Treat `pipeline_runs` / `pipeline_step_runs` as the backend task source of truth for async media ingestion and script generation
- Do not reintroduce fragment-level task state compatibility fields or `agent_runs`; task progress must stay on `pipeline_runs` / `pipeline_step_runs`
- 新增需要远端持久化的移动端实体时，优先接入 `/api/backups/*` 和本地 `entity_version / backup_status`，不要再把“先建远端业务记录”当默认路径
- Reuse existing scripts and utilities before adding new entrypoints
- 移动端出包/提审优先复用 `scripts/mobile-release.sh` 和既有 npm alias，不要在文档或脚本里重新散落 profile 名、平台参数和 `APP_ENV` 映射
- 环境配置当前只允许按 `development / production` 两层演进：后端通过 `APP_ENV + .env/.env.<env>`，移动端通过 Expo runtime config；不要再把固定 LAN 地址、测试入口或手工网络设置暴露到正式环境
- 后端测试需要分层：不依赖数据库或启动副作用的 smoke / contract 测试默认不要连接 PostgreSQL，依赖 `db_session_factory`、`app`、`async_client` 或真实 lifespan 的测试统一标记为 `integration`
- Keep comments concise. For every new or modified function, add a brief Chinese comment describing its responsibility or intent; for non-obvious or project-specific logic, also explain the key constraint or reason, but avoid line-by-line restatement of the code
- Avoid broad refactors unless they are required for the task
- Do not introduce structural drift: follow the existing module boundaries, routing shape, and layering instead of bypassing them for convenience
- Do not let files grow into monoliths; when logic, state, or UI keeps expanding, split it into focused modules/components/hooks before it becomes a large single file
- Default backend storage is PostgreSQL only; do not reintroduce SQLite compatibility branches or local SQLite fallback docs
- 文件存储默认通过统一对象存储抽象接入；本地开发可使用 `FILE_STORAGE_PROVIDER=local`，线上默认按私有 OSS + 签名 URL 设计，不要再把磁盘路径或 `storage_path` / `audio_path` 暴露为对外 contract
- 当前首页与文件夹页底部 `+` 的产品语义是“打开导入抽屉”；新增外部导入能力时优先扩展该抽屉，而不是把 `+` 改回直接跳页
- `mobile/features` 下的状态 helper 以 TypeScript 源码为单一事实源，不要再提交 `.js` / `.d.ts` 编译产物；纯状态测试统一放在 `mobile/tests/*.test.ts`，通过 `mobile/scripts/run-state-tests.mjs` 运行
- 当前正式产品形态已切到**登录后工作区**：未登录不能进入业务页面；移动端本地 SQLite、正文文件、音频缓存、图片 staging 与 backup queue 都必须按 `user_id` 工作区隔离，禁止再把不同账号的数据落到同一份本地库/目录中
- 任何会回写本地 SQLite / 文件系统的异步任务都必须绑定当前 `user_id + session_version + workspace_epoch` 作用域；切号、登出或会话失效后，旧任务只能冻结在原工作区，不能继续回写当前账号
- `POST /api/auth/token` 只允许作为本地开发联调入口；正式登录已改为邮箱密码认证，涉及认证流程时不要再恢复”自动使用测试用户进入主流程”的实现

## When Updating Docs

Update documentation when you change:

- startup or build commands
- architecture or module boundaries
- major user flows
- async task contracts or task status semantics
- environment assumptions for local development
- repository conventions or agent workflow constraints

After any structural change, update the corresponding implementation-facing docs in the same pass, including the relevant README, the matching file under `memory-bank/`, and `AGENTS.md` when conventions or collaboration rules changed.
