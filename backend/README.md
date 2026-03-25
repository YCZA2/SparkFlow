# SparkFlow Backend

SparkFlow 的 FastAPI 后端，当前采用模块化单体结构，默认以 Docker PostgreSQL + ChromaDB 联调；文件存储已统一走对象存储抽象，本地开发默认使用 `local` provider，线上可切阿里云 OSS。

## 今日进展（2026-03-25）

- 后端已经补齐 phase 1 local-first 所需的备份恢复能力：`/api/backups/batch`、`/api/backups/snapshot`、`/api/backups/restore`、`/api/backups/assets` 与 `/api/backups/assets/access`。
- 认证链路已经加入 `device_id + session_version` 语义；登录、刷新 token、备份、恢复和 AI / 转写相关请求都受单设备在线约束。
- `transcriptions`、`external_media`、`scripts/generation` 现已支持客户端本地快照 / 本地 placeholder 驱动，不再把“先创建远端 fragment 业务记录”作为默认入口。
- `media_ingestion` 已调整为 transcript-first：主 pipeline 在转写落库后即可成功，`summary` / `tags` / vector 改为异步衍生回填，不再阻塞上传和抖音导入主链路。
- Chroma 查询适配层已兼容当前 `list_collections()` 返回字符串列表的行为，`/api/fragments/similar`、向量文档列表和 namespace 统计不会再因版本差异误判为空。
- `backups` 快照当前已扩展覆盖 `script` 实体，服务端会按和 fragment / folder / media 一致的 batch contract 接收与返回成稿快照。
- scheduler 侧的 `daily push` 已切到“后端定时读取备份快照”模式：fragment 真值仍在客户端本地，但每日推盘输入只消费服务端已收到的 fragment backup snapshot，不再读取历史 `fragments` 业务表。
- 脚本生成链路的 `稳定内核` 当前改为系统预置文案，不再在生成时按用户碎片和知识库动态生成。
- `碎片方法论` 已从脚本生成主链路移出：生成时只读取已缓存条目；后台通过每日定时维护按“总量达标 / 增量达标”阈值静默刷新。
- 仓库当前仍保留 `fragments / fragment_folders` 的历史业务表与少量兼容读取能力，但它们已不是移动端 fragments / folders 的主读取来源。
- `script` 继续保留独立后端业务表与路由层；local-first 共享的是 backup/recovery 基础设施，不是把 fragment / script 合并为同一业务实体。

当前第一阶段 local-first 改造已经落地几条基础约束：

- `fragments / folders / scripts` 在移动端以本地 SQLite + 文件系统为真值
- 后端新增 `/api/backups/*` 作为自动备份与显式恢复入口，不再要求移动端先把 fragment 存进后端业务表才能继续主流程
- script 生成仍由后端 pipeline 驱动，但成功后客户端会把脚本详情立即落本地，后续编辑与拍摄状态同步走备份链路
- `/api/backups/assets/access` 可按 `object_key` 批量换取最新访问地址，供恢复时重新下载媒体缓存，避免依赖旧 snapshot 里的过期签名 URL
- 该地址刷新接口同时支持备份素材对象键与 fragment 音频对象键，便于移动端恢复时统一重建本地缓存

## Quick Start

1. Create venv and install dependencies.
2. Start local PostgreSQL via Docker.
3. Configure `.env` (see `.env.example`).
4. Run migrations and start server:

```bash
bash ../scripts/postgres-local.sh start dev
.venv/bin/alembic upgrade heads
uvicorn main:app --reload
```

Default local address: `http://127.0.0.1:8000`

默认数据库：

- 开发库：`sparkflow`
- 测试库：`sparkflow_test`
- 默认连接串仍是 `postgresql+psycopg://sparkflow:sparkflow@127.0.0.1:5432/...`

也可以直接使用根目录脚本让数据库随联调 / 测试自动启动：

```bash
bash scripts/dev-mobile.sh
bash scripts/test-all.sh
```

本地联调默认测试账号 `test-user-001` 会在应用启动和 `POST /api/auth/token` 时自动补齐到数据库，避免切库后出现外键错误。
`POST /api/auth/token` 现在会接收 `device_id` 并创建 `device session`，用于单设备在线校验。

当前脚本生成已经升级为“三层写作上下文 + 主题 + SOP 大纲”链路，不再使用 `mode_a / mode_b` 两套独立工作流配置。

当前生成链路依赖：

- `LLM_PROVIDER` 对应的文本生成能力，用于碎片方法论离线提炼、大纲和草稿生成
- `Embedding + VectorStore`，用于检索相关知识与相关碎片
- `POST /api/scripts/generation` 的输入收敛为 `topic` + `fragment_ids`

如果你想验证“真实后端 + 当前脚本生成 pipeline”的整条链路，可以运行：

```bash
cd backend
.venv/bin/python scripts/test_dify_script_generation.py --cleanup
```

这个联调脚本会：

- 调用 `POST /api/auth/token` 获取测试用户 token
- 创建 1-2 条手动文本碎片
- 调用 `POST /api/scripts/generation`
- 轮询 `GET /api/pipelines/{run_id}` 直到终态
- 成功后读取 `GET /api/scripts/{script_id}` 并打印结果摘要
- 传入 `--cleanup` 时自动删除本次联调创建的碎片和脚本

如果你想验证“真实知识库上传 + 搜索 + 脚本生成”整条链路，可以运行：

```bash
cd backend
.venv/bin/python scripts/test_knowledge_generation.py --cleanup
```

这个轻量联调脚本会：

- 生成一组临时 `txt/docx/pdf/xlsx` 样本文件
- 调用 `POST /api/knowledge/upload` 分别创建 `reference_script`、`high_likes`、`language_habit`
- 轮询 `reference_script` 直到异步处理完成
- 调用 `POST /api/knowledge/search` 验证 chunk 聚合检索结果
- 创建 1-2 条手动碎片并触发 `POST /api/scripts/generation`
- 轮询 `GET /api/pipelines/{run_id}` 直到终态
- 成功后读取 `GET /api/scripts/{script_id}` 并输出搜索命中和脚本摘要
- 传入 `--cleanup` 时自动删除本次联调创建的知识文档、碎片和脚本

客户端只需要继续轮询 SparkFlow 自己的 `/api/pipelines/{run_id}`，不需要感知后台每日方法论刷新、大纲生成和草稿落库的后端内部步骤。

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
   - 负责 LLM、STT、Embedding、VectorStore、FileStorage、WorkflowProvider 等端口与实现。
   - `modules/shared/container.py` 只负责 `ServiceContainer` 和默认依赖装配。
   - `backend/prompts/` 是当前后端 prompt 文本与模板的统一存放位置；代码层只负责读取与填充变量，不再直接内嵌长 prompt 文本。
   - `modules/shared/infrastructure.py` 只保留兼容导出，真实实现拆到 `storage.py`、`vector_store.py`、`providers.py`。
   - `modules/shared/audio_ingestion_use_case.py` 负责媒体导入入口编排，`media_ingestion_steps.py` 负责 transcript-first 步骤执行，`media_ingestion_persistence.py` 负责落库与终态输出。
   - `modules/shared/audio_ingestion.py` 保留统一入口导出，供现有依赖平滑迁移。
   - `modules/shared/pipeline_runtime.py` 提供持久化后台流水线运行时、worker 抢占、重试与恢复。
   - `modules/fragments/derivative_pipeline.py` 负责 fragment 摘要、标签与向量的异步回填流水线。
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
- `modules/transcriptions/`: 音频上传、后台转写、转写状态查询；主任务以 transcript 成功为准，摘要标签随后异步补齐。
- `modules/external_media/`: 外部媒体音频导入，当前支持抖音分享链接；请求入口只创建任务，解析链接、下载转 m4a、转写先在主流水线完成，摘要/标签/向量由后续衍生流水线回填。
- `modules/scripts/`: 口播稿生成、脚本生成 pipeline 定义、上下文构建、结果回流、列表、详情、更新、删除、每日推盘；其中 daily push 现在通过备份快照 reader 聚合 fragment 真值。
- `modules/knowledge/`: 知识库文档创建、上传、搜索、删除；当前已按 `parsers / chunking / indexing / application` 拆层，文本型上传支持 `txt/docx/pdf/xlsx`。
- `modules/pipelines/`: 后台流水线详情、步骤和重跑 API。
- `modules/debug_logs/`: 接收移动端调试日志，并通过结构化日志链路写入本地文件。
- `modules/media_assets/`: 统一媒体资源上传、列表和删除。
- `modules/exports/`: Markdown 单条导出和批量 zip 导出。
- `modules/scheduler/`: APScheduler 装配与每日推盘、写作上下文维护调度入口。
- `modules/shared/`: 模块共享端口、DI 容器、增强逻辑，不承载独立业务模块。

当前 `modules/scripts/` 内部约定：

- `application.py` 只保留查询、命令和每日推盘编排入口。
- `rag_pipeline.py` 只负责 `rag_script_generation` 步骤定义与协调。
- `daily_push_pipeline.py` 只负责 `daily_push_generation` 步骤定义与结果回流。
- `writing_context_builder.py` 负责预置稳定内核、缓存方法论读取、相关素材召回，以及每日碎片方法论维护任务。
- `rag_context_builder.py` 负责把三层上下文、大纲和当前碎片背景拼成最终提示词。
- `persistence.py` 负责脚本幂等落库。
- `daily_push.py` 负责每日推盘的碎片拼接和相似度筛选规则。
- `daily_push_snapshots.py` 负责从 `backup_records` 读取 fragment 快照，并规整为每日推盘专用 DTO。

当前 `modules/fragments/` 内部约定：

- `application.py` 只保留碎片写操作编排与查询入口。
- `mapper.py` 负责碎片与素材响应映射。
- `content_service.py` 负责 Markdown 块写入和 effective text 读取。
- `derivative_service.py` 负责摘要、标签和向量衍生同步。
- `asset_binding_service.py` 负责媒体素材绑定关系维护。

### Persistence and providers

- `domains/`: 各业务领域仓储，按聚合拆分 repository。
- `models/`: SQLAlchemy ORM 模型和数据库 session 工厂。
- `services/`: 外部 provider 适配器与工厂，当前包含 LLM / STT / Embedding，以及保留给实验性外挂工作流的 `DifyWorkflowProvider`。
- `prompts/`: Prompt 模板文件。

当前职责边界：

- `llm_provider` 承担碎片摘要/标签增强，以及当前脚本生成和每日推盘所需的文本生成能力。
- `workflow_provider` 当前不在主脚本生成链路上，主要保留给实验性外挂工作流接入。
- `knowledge_index_store` 是知识库索引的独立抽象；默认实现仍由 `AppVectorStore` 适配 Chroma，未来若切到 LightRAG 之类底层引擎，应优先替换这一层，而不是改 `knowledge`/`scripts` 业务模块。

### Runtime data and maintenance

- `alembic/`: 数据库迁移。
- `tests/`: `pytest` + `Schemathesis` 测试。
- `scripts/`: 后端本地辅助脚本。
- `../docker-compose.postgres.yml`: 本地 PostgreSQL Docker 编排文件。
- `uploads/`: `local` 文件存储 provider 的对象根目录，配置层会固定解析到 `backend/uploads/`，不依赖启动 cwd。
- `chroma_data/`: 本地 ChromaDB 数据目录，相对路径同样固定解析到 `backend/chroma_data/`。
- 当前 Chroma 版本的 `list_collections()` 可能直接返回集合名字符串；应用适配层已统一兼容字符串和旧对象结构，避免 namespace 存在性检查误判。
- `runtime_logs/`: 运行时日志目录，当前包含后端全量日志、错误日志和移动端错误日志文件。

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

内容字段约定：

- `fragments` 与 `scripts` 对外接口统一暴露 `body_html` 作为正文真值；导出链路再统一转换 Markdown。
- `fragments` 与 `scripts` 数据库层只保留 `body_html`，不再保留正文 Markdown 真值列。
- `knowledge` 对外接口仍接收和返回 `body_markdown`；数据库中的 `content` 仅保留为 Markdown 派生的纯文本索引载荷。
- `knowledge_docs` 现在额外记录 `source_type / source_filename / source_mime_type / chunk_count / processing_error / updated_at`，用于上传来源、索引状态和未来索引迁移。
- `POST /api/knowledge/search` 对外仍返回文档级结果，但内部已经改为 chunk 召回后聚合，并会附带 `matched_chunks` 供后续 citation 能力兼容。
- `scripts` 的 RAG 生成现在会自动消费三类知识文档：`reference_script` 提供风格描述和示例块，`high_likes` 提供高赞结构参考，`language_habit` 提供措辞与语气习惯约束。

文件存储相关配置：

```bash
FILE_STORAGE_PROVIDER=local  # 或 oss
OSS_ENDPOINT=oss-cn-hangzhou.aliyuncs.com
OSS_BUCKET=sparkflow-private
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
OSS_URL_EXPIRE_SECONDS=3600
```

本地数据库相关命令：

```bash
bash scripts/postgres-local.sh start all
bash scripts/postgres-local.sh status
bash scripts/postgres-local.sh logs
bash scripts/postgres-local.sh stop
```

脚本行为约定：

- `bash scripts/dev-mobile.sh` 会在 Alembic 之前自动确保本地 Docker PostgreSQL 可用
- `bash scripts/test-all.sh` 会在 pytest 之前自动确保 `sparkflow_test` 可用
- 开发库是否跳过本地 Docker 由 `DATABASE_URL` 控制；测试库是否跳过本地 Docker 只由 `TEST_DATABASE_URL` 控制

任务与工作流相关接口：

- `POST /api/scripts/generation`
- `GET /api/pipelines/{run_id}`
- `GET /api/pipelines/{run_id}/steps`
- `POST /api/pipelines/{run_id}/retry`

当前接入策略：

- `POST /api/transcriptions` / `POST /api/external-media/audio-imports` / `POST /api/scripts/generation` / `POST /api/scripts/daily-push/trigger` / `POST /api/scripts/daily-push/force-trigger` 现在都会先创建 `pipeline_runs`
- `GET /api/pipelines/{run_id}` / `GET /api/pipelines/{run_id}/steps` / `POST /api/pipelines/{run_id}/retry` 提供统一后台任务观察与补偿入口
- `POST /api/external-media/audio-imports` 不再同步解析或下载媒体；`resolve_external_media` / `download_media` 也属于 `media_ingestion` pipeline 步骤
- `media_ingestion` 当前固定步骤为 `resolve_external_media`（按需）、`download_media`、`transcribe_audio`、`finalize_fragment`；`GET /api/pipelines/{run_id}` 成功时允许 `summary=null`、`tags=[]`
- transcript 落库后会最佳努力创建内部 `fragment_derivative_backfill` pipeline，异步执行摘要、标签和向量回填；该回填失败不会回滚已成功的 ingest
- SparkFlow 后端先收集预置稳定内核、已缓存方法论、相关素材和可选碎片背景，再生成大纲与草稿
- `rag_script_generation` pipeline 依次执行 `generate_outline`、`retrieve_examples`、`generate_script_draft`、`persist_script`
- `pipeline_runs` / `pipeline_step_runs` 是后台状态事实源
- `agent_runs` 与 `/api/agent/*` 已移除，脚本生成公开链路完全收口到 `scripts + pipelines`

任务态客户端约定：

- `POST /api/transcriptions` 返回 `pipeline_run_id`、`pipeline_type`、`fragment_id`
- `POST /api/external-media/audio-imports` 请求体支持 `share_url`、`platform` 和可选 `folder_id`，返回 `pipeline_run_id`、`pipeline_type`、`fragment_id`
- `POST /api/scripts/generation` 返回 `pipeline_run_id`、`pipeline_type`、`status`
- `POST /api/scripts/daily-push/trigger` / `POST /api/scripts/daily-push/force-trigger` 返回 `pipeline_run_id`、`pipeline_type`、`status`
- `GET /api/scripts` / `GET /api/scripts/{script_id}` 在没有来源碎片时会稳定返回 `source_fragment_ids=[]` 与 `source_fragment_count=0`，不使用 `null`
- 文件类响应不再暴露 `audio_path` / `storage_path`，统一返回签名 `*_file_url` 与过期时间
- `fragments` 列表 / 详情与 `GET /api/transcriptions/{fragment_id}` 不再返回 `sync_status`
- `fragments.transcript` 表示机器转写原文，`body_html` 表示用户整理后的正式正文；正文消费统一按 `body_html -> transcript` 回退
- 非语音碎片创建走 `POST /api/fragments/content`；当前允许先创建空 `body_html`，再由客户端后续补正文，`transcript` 仅保留给语音转写链路
- 客户端应轮询 `/api/pipelines/{run_id}`，在成功后再读取 `fragment_id` 或 `script_id`；对 transcript 任务来说，首个成功仅保证 transcript 已可用，`summary` / `tags` 可能在下一次详情刷新时补齐
- 外链导入成功后的 `platform`、`share_url`、`media_id`、`title`、`author`、`cover_url`、`content_type`、`audio_file_url` 统一从 `GET /api/pipelines/{run_id}` 的 `output` 读取
- 当前移动端已切脚本生成任务态；外链导入也已接入底部 `+` 抽屉、导入页和任务态轮询

## Frontend Debug Logs

运行时日志现在会同时：

- 后端结构化日志继续输出到控制台
- 后端全量业务日志写入 [`backend/runtime_logs/backend.log`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/runtime_logs/backend.log)
- 后端 `ERROR` 及以上日志额外写入 [`backend/runtime_logs/backend-error.log`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/runtime_logs/backend-error.log)
- 移动端上报的调试日志保存在 App 内错误日志页中
- 移动端调试日志通过专用 file handler 写入 [`backend/runtime_logs/mobile-debug.log`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/runtime_logs/mobile-debug.log)

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
tail -n 100 backend/runtime_logs/backend.log
tail -n 100 backend/runtime_logs/backend-error.log
tail -n 100 backend/runtime_logs/mobile-debug.log
```

这样真机/模拟器上的 JS 异常、`console.error`、接口错误就不需要手动复制给 Codex。

## Tests

Current tests are runnable with `pytest`:

```bash
cd backend
.venv/bin/pytest
```

Run the lightweight backend suite that does not require PostgreSQL:

```bash
cd backend
.venv/bin/pytest -m "not integration"
```

Run the PostgreSQL-backed integration baseline:

```bash
bash scripts/postgres-local.sh start test
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

Tests marked with `integration` depend on PostgreSQL or application startup side effects. The recommended local workflow is to run `pytest -m "not integration"` first for fast feedback, then run the full suite with PostgreSQL available.

## API Docs

When `DEBUG=true`:

- Swagger UI: `/docs`
- ReDoc: `/redoc`
