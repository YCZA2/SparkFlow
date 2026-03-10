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

如果启用当前默认的 Dify workflow provider adapter，还需要配置：

```bash
DIFY_BASE_URL=https://your-dify.example.com/v1
DIFY_API_KEY=app-xxx
DIFY_SCRIPT_WORKFLOW_ID=wf-script-generation
```

如果要在本地自托管 Dify，可在仓库根目录执行：

```bash
bash scripts/dify-local.sh start
```

这个脚本会：

1. 从官方 `langgenius/dify` 仓库拉取最新 release（或使用 `DIFY_VERSION` 指定版本）
2. 在 `backend/.vendor/dify` 下准备官方 Docker 部署目录
3. 自动生成 `docker/.env`
4. 以 `postgresql` profile 启动 Dify，并默认暴露到 `http://127.0.0.1:18080`

随后把后端 `.env` 中的 Dify 配置改为类似：

```bash
DIFY_BASE_URL=http://127.0.0.1:18080/v1
DIFY_API_KEY=app-xxx
DIFY_SCRIPT_WORKFLOW_ID=wf-script-generation
```

如果不想在 Dify 页面里手工从零搭工作流，仓库已经提供可直接导入的 DSL 模板：

```bash
backend/dify_dsl/sparkflow_script_generation.workflow.yml
```

导入后建议检查两项：

1. LLM 节点模型是否已经切到你在 Dify 中真实可用的 provider / model
2. 导入后的应用 API Key 和 workflow 标识是否已经回填到后端 `.env`

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
   - 负责 LLM、STT、Embedding、VectorStore、AudioStorage、WorkflowProvider 等端口与实现。
   - `modules/shared/container.py` 只负责 `ServiceContainer` 和默认依赖装配。
   - `modules/shared/infrastructure.py` 集中放本地存储、向量存储适配、PromptLoader 和 provider 构造辅助。
   - `modules/shared/audio_ingestion.py` 提供统一媒体导入流水线步骤，供上传音频和外部链接导入复用。
   - `modules/shared/pipeline_runtime.py` 提供持久化后台流水线运行时、worker 抢占、重试与恢复。
7. `modules/pipelines`
   - 后台任务流水线层。
   - 负责 `pipeline_runs` / `pipeline_step_runs` 查询、步骤详情与手动重跑。
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
- `modules/scripts/`: 口播稿生成、脚本生成 pipeline 定义、上下文构建、结果回流、列表、详情、更新、删除、每日推盘。
- `modules/knowledge/`: 知识库文档创建、上传、搜索、删除。
- `modules/pipelines/`: 后台流水线详情、步骤和重跑 API。
- `modules/debug_logs/`: 接收移动端调试日志，并通过结构化日志链路写入本地文件。
- `modules/media_assets/`: 统一媒体资源上传、列表和删除。
- `modules/exports/`: Markdown 单条导出和批量 zip 导出。
- `modules/scheduler/`: APScheduler 装配与每日推盘调度入口。
- `modules/shared/`: 模块共享端口、DI 容器、增强逻辑，不承载独立业务模块。

当前 `modules/scripts/` 内部约定：

- `application.py` 只保留查询、命令和每日推盘编排入口。
- `pipeline.py` 只负责 `script_generation` 步骤定义与协调。
- `context_builder.py` 负责脚本生成的输入校验和研究上下文构建。
- `persistence.py` 负责 workflow 输出解析与脚本幂等落库。
- `daily_push.py` 负责每日推盘的碎片拼接和相似度筛选规则。

### Persistence and providers

- `domains/`: 各业务领域仓储，按聚合拆分 repository。
- `models/`: SQLAlchemy ORM 模型和数据库 session 工厂。
- `services/`: 外部 provider 适配器与工厂，当前包含 LLM / STT / Embedding 和 `DifyWorkflowProvider`。
- `prompts/`: Prompt 模板文件。

### Runtime data and maintenance

- `alembic/`: 数据库迁移。
- `tests/`: `pytest` + `Schemathesis` 测试。
- `scripts/`: 后端本地辅助脚本。
- `uploads/`: 本地音频上传目录，配置层会固定解析到 `backend/uploads/`，不依赖启动 cwd。
- `uploads/external_media/<user_id>/<platform>/`: 外部媒体导入后的音频文件。
- `uploads/media_assets/<user_id>/<kind>/`: 手动上传的统一素材文件。
- `chroma_data/`: 本地 ChromaDB 数据目录，相对路径同样固定解析到 `backend/chroma_data/`。
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

Current business modules include `auth`, `fragment_folders`, `fragments`, `transcriptions`, `external_media`, `scripts`, `knowledge`, `media_assets`, `exports`, `pipelines`, `debug_logs`, and `scheduler`.

任务与工作流相关接口：

- `POST /api/scripts/generation`
- `GET /api/pipelines/{run_id}`
- `GET /api/pipelines/{run_id}/steps`
- `POST /api/pipelines/{run_id}/retry`

当前接入策略：

- `POST /api/transcriptions` / `POST /api/external-media/audio-imports` / `POST /api/scripts/generation` 现在都会先创建 `pipeline_runs`
- `GET /api/pipelines/{run_id}` / `GET /api/pipelines/{run_id}/steps` / `POST /api/pipelines/{run_id}/retry` 提供统一后台任务观察与补偿入口
- SparkFlow 后端先收集 fragments、knowledge hits 和可选 web hits
- SparkFlow 后端先把这些内容组装为结构化上下文，再交给通用 `workflow_provider`
- 当前 Dify adapter 会在适配层把 `selected_fragments`、`knowledge_hits`、`web_hits`、`user_context`、`generation_metadata` 序列化为 JSON 字符串，以兼容 Dify Start 节点
- 外挂工作流 provider 只消费整理后的上下文并返回结构化输出
- `pipeline_runs` / `pipeline_step_runs` 是后台状态事实源
- `agent_runs` 与 `/api/agent/*` 已移除，脚本生成公开链路完全收口到 `scripts + pipelines`

任务态客户端约定：

- `POST /api/transcriptions` 返回 `pipeline_run_id`、`pipeline_type`、`fragment_id`
- `POST /api/external-media/audio-imports` 返回 `pipeline_run_id`、`pipeline_type`、`fragment_id`
- `POST /api/scripts/generation` 返回 `pipeline_run_id`、`pipeline_type`、`status`
- `fragments` 列表 / 详情与 `GET /api/transcriptions/{fragment_id}` 不再返回 `sync_status`
- 客户端应轮询 `/api/pipelines/{run_id}`，在成功后再读取 `fragment_id` 或 `script_id`
- 当前移动端已切脚本生成任务态；媒体上传和外链导入的客户端统一任务态展示仍作为后续阶段继续补齐

当前仓库附带的 Dify DSL 目录：

- `backend/dify_dsl/README.md`
- `backend/dify_dsl/sparkflow_script_generation.workflow.yml`

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

## Local Dify Operations

仓库已内置 Dify 本地部署脚本：

```bash
bash scripts/dify-local.sh install
bash scripts/dify-local.sh start
bash scripts/dify-local.sh status
bash scripts/dify-local.sh logs
bash scripts/dify-local.sh stop
```

补充说明：

- 该脚本依赖本机已安装 `Docker Desktop`、`docker compose`、`git`、`curl`、`python3`
- 为避免占用本机 `80` 端口，脚本会把 Dify 默认映射到 `18080`
- 官方源码会落在 `backend/.vendor/dify/`，已加入 `.gitignore`
- 本地联调已验证链路：SparkFlow 后端 -> 本地 Dify Workflow -> 脚本落库
- 如果想固定官方版本，可执行：

```bash
DIFY_VERSION=v1.11.2 bash scripts/dify-local.sh start
```
