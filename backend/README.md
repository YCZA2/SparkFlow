# SparkFlow Backend

SparkFlow 的 FastAPI 后端，当前采用模块化单体结构，默认以本地 PostgreSQL + ChromaDB + 本地文件存储联调。

## Quick Start

1. Create venv and install dependencies.
2. Start PostgreSQL and create a local database such as `sparkflow`.
3. Configure `.env` (see `.env.example`).
4. Run migrations and start server:

```bash
.venv/bin/alembic upgrade head
uvicorn main:app --reload
```

Default local address: `http://127.0.0.1:8000`

本地联调默认测试账号 `test-user-001` 会在应用启动和 `POST /api/auth/token` 时自动补齐到数据库，避免切库后出现外键错误。

如果启用 Dify 外挂工作流，还需要配置：

```bash
DIFY_BASE_URL=https://your-dify.example.com/v1
DIFY_API_KEY=app-xxx
DIFY_SCRIPT_WORKFLOW_ID=wf-script-research
```

## Backend Architecture

当前后端按如下层级协作：

1. `presentation`
   - FastAPI 路由层。
   - 负责路由声明、依赖注入、参数读取、响应模型声明。
2. `schemas`
   - 模块内 API 契约层。
   - 负责 request / response DTO，作为 OpenAPI 的单一事实源。
3. `application`
   - 用例编排层。
   - 负责业务流程、校验、聚合仓储和 provider 调用。
4. `domains`
   - 数据访问层。
   - 负责 SQLAlchemy 查询和持久化。
5. `models`
   - ORM / DB 基础设施层。
   - 负责数据库连接、Session、表模型。
6. `modules/shared` + `services`
   - 外部能力抽象与适配层。
   - 负责 LLM、STT、Embedding、VectorStore、AudioStorage 等端口与实现。
   - `modules/shared/audio_ingestion.py` 提供统一音频碎片导入管线，供上传音频和外部链接导入复用。
7. `modules/agent`
   - Dify 外挂工作流层。
   - 负责脚本研究 run 的创建、状态刷新、结果映射与脚本回流。
8. `core/logging_config.py`
   - 结构化日志装配层。
   - 负责 `structlog` 配置、request-id 绑定，以及控制台输出和移动端调试日志文件输出。

## Folder Guide

### Core entry and infra

- `main.py`: FastAPI 应用入口，负责装配 request-id 中间件、异常处理、路由和 lifespan。
- `core/`: 通用基础设施，包括配置、认证、标准响应、异常定义和结构化日志。
- `constants/`: 共享常量。
- `utils/`: 序列化、时间处理等通用工具函数。

### Business modules

- `modules/auth/`: 测试令牌签发、当前用户信息、刷新令牌。
- `modules/fragment_folders/`: 碎片文件夹 CRUD 和文件夹统计。
- `modules/fragments/`: 碎片列表、详情、移动、标签、相似检索、可视化。
- `modules/transcriptions/`: 音频上传、后台转写、转写状态查询。
- `modules/external_media/`: 外部媒体音频导入，当前支持抖音分享链接转 m4a，并直接创建碎片进入统一转写流程。
- `modules/scripts/`: 口播稿生成、列表、详情、更新、删除、每日推盘。
- `modules/knowledge/`: 知识库文档创建、上传、搜索、删除。
- `modules/agent/`: Dify 外挂脚本研究工作流和 run 状态管理。
- `modules/debug_logs/`: 接收移动端调试日志，并通过结构化日志链路写入本地文件。
- `modules/scheduler/`: APScheduler 装配与每日推盘调度入口。
- `modules/shared/`: 模块共享端口、DI 容器、增强逻辑，不承载独立业务模块。

### Persistence and providers

- `domains/`: 各业务领域仓储，按聚合拆分 repository。
- `models/`: SQLAlchemy ORM 模型和数据库 session 工厂。
- `services/`: 外部 provider 适配器与工厂，主要是 LLM / STT / Embedding 集成。
- `prompts/`: Prompt 模板文件。

### Runtime data and maintenance

- `alembic/`: 数据库迁移。
- `tests/`: `pytest` + `Schemathesis` 测试。
- `scripts/`: 后端本地辅助脚本。
- `uploads/`: 本地音频上传目录。
- `uploads/external_media/<user_id>/<platform>/`: 外部媒体导入后的音频文件。
- `chroma_data/`: 本地 ChromaDB 数据目录。
- `runtime_logs/`: 运行时日志目录，当前包含移动端错误日志文件。

## Coding Conventions

- 新增业务优先放在 `modules/<module>/`，不要继续把业务逻辑扩散到 `services/`。
- `presentation.py` 只做路由声明、依赖注入和请求/响应拼装，不写核心业务。
- `schemas.py` 是模块 API contract 的单一事实源；不要再回退到旧的全局 schema 组织方式。
- `application.py` 负责业务编排，可以调用 repository、shared port、provider，但不要依赖 FastAPI 请求对象。
- `domains/*/repository.py` 只做数据访问，不承载跨资源业务规则。
- 所有对外接口都应显式声明 `response_model=ResponseModel[...]`，让 `/docs` 与 `/redoc` 可直接作为契约文档。
- 删除接口统一返回 `200 + ResponseModel[None]`，成功时 `data` 固定为 `null`。
- 复用型 DTO 或端口抽象只有在多个模块语义完全一致时才进入 `modules/shared/`。
- 优先做模块内演进，避免“全局共用抽象”过早膨胀。
- 注释保持简洁，只有在业务逻辑不直观时再补充说明。

## API Contract Rules

- 请求和响应模型都放在模块内 `schemas.py`。
- `presentation.py` 通过 `response_model=ResponseModel[...]` 声明标准返回结构。
- OpenAPI 文档默认使用中文 `summary` / `description`，便于产品、前端和后端共同阅读。

当前仓库的前后端并行开发约定见 [`memory-bank/frontend-backend-collaboration.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/frontend-backend-collaboration.md)。如果接口字段、状态枚举或返回结构发生变化，后端需要在更新 `schemas.py` 的同时同步这份协作规范涉及的联调约定。

Current business modules include `auth`, `fragment_folders`, `fragments`, `transcriptions`, `external_media`, `scripts`, `knowledge`, `agent`, `debug_logs`, and `scheduler`.

外挂工作流接口：

- `POST /api/agent/script-research-runs`
- `GET /api/agent/runs/{run_id}`
- `POST /api/agent/runs/{run_id}/refresh`

当前接入策略：

- SparkFlow 后端先收集 fragments、knowledge hits 和可选 web hits
- Dify 只消费整理后的上下文并生成结构化输出
- 本地 `agent_runs` 记录是运行状态事实源，成功后再回流创建 `scripts`

## Frontend Debug Logs

移动端错误日志现在会同时：

- 保存在 App 内错误日志页中
- 通过 `structlog` 专用文件 handler 写入后端本地文件 [`backend/runtime_logs/mobile-debug.log`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/runtime_logs/mobile-debug.log)

后端接收接口：

- `POST /api/debug/mobile-logs`

联调方式：

1. 启动联调环境：

```bash
bash scripts/dev-mobile.sh
```

2. 在 App 内进入：

- `创作工作台`
- `错误日志`

3. 复现问题后，Codex 可以直接读取日志文件：

```bash
tail -n 100 backend/runtime_logs/mobile-debug.log
```

这样真机/模拟器上的 JS 异常、`console.error`、接口错误就不需要手动复制给 Codex。

## Tests

Current tests are runnable with `pytest`:

```bash
cd backend
.venv/bin/pytest
```

Run the full repository test suite from root with:

```bash
bash scripts/test-all.sh
```

OpenAPI contract smoke tests are driven by `Schemathesis`:

```bash
cd backend
.venv/bin/pytest tests/test_openapi_contracts.py
```

## API Docs

When `DEBUG=true`:

- Swagger UI: `/docs`
- ReDoc: `/redoc`
