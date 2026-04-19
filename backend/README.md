# SparkFlow Backend

SparkFlow 的 FastAPI 后端，当前采用模块化单体结构，默认以本机 PostgreSQL + ChromaDB 联调；文件存储已统一走对象存储抽象，本地开发默认使用 `local` provider，线上可切阿里云 OSS。

## 今日进展（2026-04-01）

- 后端单机生产部署链路现已验证过一轮：阿里云 ECS 上按 `systemd + nginx + PostgreSQL + 本地 Chroma/uploads` 运行，`/api/*` 与 `/uploads/*` 通过同域名反代暴露。
- 后端配置现已支持 `APP_ENV=development|production` 两层装配：按 `.env` + `.env.<env>` 顺序加载，并在 production 下对危险开发配置执行 fail-fast 校验。
- 后端已经补齐 phase 1 local-first 所需的备份恢复能力：`/api/backups/batch`、`/api/backups/snapshot`、`/api/backups/restore`、`/api/backups/assets` 与 `/api/backups/assets/access`。
- 正式认证链路已经升级为邮箱密码登录，JWT 继续携带 `device_id + session_version`；登录、刷新 token、备份、恢复和 AI / 转写相关请求都受单设备在线约束。
- `transcriptions`、`external_media`、`scripts/generation` 现已支持客户端本地快照 / 本地 placeholder 驱动，不再把“先创建远端 fragment 业务记录”作为默认入口。
- 后端已补齐通用 `fragment snapshot reader`：脚本生成上下文、相似检索、灵感云图和每日推盘都统一从 `backup_records` 读取已同步成功的 fragment snapshot，不再把 `fragments` 表当输入真值。
- `fragments / fragment_tags / fragment_blocks` 旧投影表本轮已经下线：标签聚合、导出、文件夹计数和衍生回填统一改成 snapshot 读写。
- `POST /api/transcriptions` 与 `POST /api/external-media/audio-imports` 现在都要求客户端显式传入 `local_fragment_id`；后端不再兜底创建远端 fragment 记录。
- 服务器生成字段会直接补写回 fragment snapshot：`transcript`、`speaker_segments`、`summary`、`tags`、`audio_object_key` 与音频访问地址都会进入 `backup_records`，且客户端后续 flush 不会覆盖这些服务端字段。
- `media_ingestion` 已调整为 transcript-first：主任务在转写落库后即可成功，`summary` / `tags` / vector 改为异步衍生回填，不再阻塞上传和抖音导入主链路。
- Chroma 查询适配层已兼容当前 `list_collections()` 返回字符串列表的行为，`/api/fragments/similar`、向量文档列表和 namespace 统计不会再因版本差异误判为空。
- `backups` 快照当前已扩展覆盖 `script` 实体，服务端会按和 fragment / folder / media 一致的 batch contract 接收与返回成稿快照。
- scheduler 侧的 `daily push` 已切到“后端定时读取备份快照”模式：fragment 真值仍在客户端本地，但每日推盘输入只消费服务端已收到的 fragment backup snapshot，不再读取历史 `fragments` 业务表。
- 脚本生成链路的 `稳定内核` 当前改为系统预置文案，不再在生成时按用户碎片和知识库动态生成。
- `碎片方法论` 已从脚本生成主链路移出：生成时只读取已缓存条目；后台通过每日定时维护按“总量达标 / 增量达标”阈值静默刷新。
- `script` 继续保留独立后端业务表与路由层；local-first 共享的是 backup/recovery 基础设施，不是把 fragment / script 合并为同一业务实体；后端 `scripts` 表当前只保存生成初稿与兼容查询投影，不再承担移动端编辑真值语义。

当前第一阶段 local-first 改造已经落地几条基础约束：

- `fragments / folders / scripts` 在移动端以本地 SQLite + 文件系统为真值
- 后端新增 `/api/backups/*` 作为自动备份与显式恢复入口，不再要求移动端先把 fragment 存进后端业务表才能继续主流程
- script 生成仍由后端 task runtime 驱动，但成功后客户端会把脚本详情立即落本地，后续编辑与拍摄状态同步走备份链路；`GET /api/scripts/*` 继续读 `scripts` 表，仅用于缺失补齐和兼容查询，不应用来覆盖客户端已存在的本地 script 真值
- `/api/backups/assets/access` 可按 `object_key` 批量换取最新访问地址，供恢复时重新下载媒体缓存，避免依赖旧 snapshot 里的过期签名 URL
- 该地址刷新接口同时支持备份素材对象键与 fragment 音频对象键，便于移动端恢复时统一重建本地缓存

## Quick Start

1. Copy env template and prepare a backend venv.

```bash
cd backend
cp .env.example .env
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

2. Ensure local PostgreSQL and RabbitMQ are installed and running.

```bash
APP_ENV=development bash ../scripts/postgres-local.sh start dev
bash ../scripts/rabbitmq-local.sh start
```

3. Fill in `backend/.env`.

- Backend startup currently requires a non-empty `DASHSCOPE_API_KEY`.
- If you only need to boot the backend, open the app shell, or debug non-AI pages locally, you may temporarily set `DASHSCOPE_API_KEY=test-dashscope-key`.
- AI generation, transcription, embeddings, and other DashScope-backed flows still require a real key.

4. Run migrations, then start worker and server in two terminals:

```bash
APP_ENV=development .venv/bin/alembic upgrade heads
```

Terminal A:

```bash
APP_ENV=development CELERY_RESULT_BACKEND=rpc:// ../scripts/celery-worker.sh
```

Terminal B:

```bash
APP_ENV=development CELERY_RESULT_BACKEND=rpc:// .venv/bin/uvicorn main:app --reload --no-access-log
```

也可以不使用 helper，手动执行 worker：

```bash
APP_ENV=development CELERY_RESULT_BACKEND=rpc:// CELERY_TASK_ALWAYS_EAGER=false .venv/bin/celery -A celery_app:celery_app worker -Q transcription,fragment-derivative,document-import,script-generation,knowledge-processing,daily-push,default --pool=solo --concurrency=1 --loglevel=INFO
```

如果你是从仓库根目录首次拉起整套移动端联调环境，建议先完成以下依赖引导，再运行 `bash scripts/dev-mobile.sh`：

```bash
python3.12 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
brew install rabbitmq
cd mobile && npm install
```

说明：

- `scripts/dev-mobile.sh` 会优先使用 `backend/.venv`；如果它不存在，脚本会退回系统 `python3`，这通常会导致 `alembic` 等依赖缺失。
- 移动端依赖只应在 `mobile/` 目录内安装，不要在仓库根目录执行 `npm install`。

首次在 macOS 上配置本机数据库时，推荐：

```bash
brew install postgresql@16
brew services start postgresql@16
```

`bash ../scripts/postgres-local.sh start dev` 会在数据库服务可达后，幂等确保默认开发库 `sparkflow` 已创建；`start test` / `start all` 同理会补齐 `sparkflow_test`。

当前 Alembic 已收口为单一 baseline：

- 全新本地库可直接执行 `.venv/bin/alembic upgrade heads`
- 若本地开发库曾跑过旧迁移链、手工修表或出现 schema 漂移，推荐直接清空 `public` schema 后重跑 baseline，而不是继续补增量迁移
- 当前数据库结构清单可查看 `backend/docs/schema-inventory.md`

Default local address: `http://127.0.0.1:8000`

生产环境约束：

- `APP_ENV=production` 时必须替换默认 `SECRET_KEY`
- `APP_ENV=production` 时禁止 `ENABLE_TEST_AUTH=true`
- `APP_ENV=production` 时禁止 `DEBUG=true` 或 `LOG_LEVEL=DEBUG`
- 由于 `.env.<env>` 的装配取决于 `APP_ENV` 预解析，生产环境执行 `uvicorn`、`alembic`、一次性脚本和 `systemd` 时都必须显式带上 `APP_ENV=production`
- 线上推荐把密钥与数据库连接串放到外置 env 文件，再由 `systemd EnvironmentFile` 和迁移命令显式加载；不要在远端项目目录保留 `backend/.env`

## Aliyun Deployment

阿里云单机部署文档见 [`backend/docs/aliyun-single-node-deploy.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/docs/aliyun-single-node-deploy.md)。

当前生产口径：

- 通过 `bash scripts/deploy-backend-aliyun.sh deploy` 复用 `ssh aliyun` + `rsync` 发布后端
- 以 `systemd` 启动单个 `uvicorn` 进程：`--workers 1`
- 异步任务由独立 Celery worker 消费 RabbitMQ，不在 API 进程内执行
- 远端环境变量默认放在 `/home/ycza/.config/sparkflow/backend.env`
- 远端用户可直接执行 `sparkflow-backend-restart` 或 `sfrestart` 重启服务并查看状态
- `nginx` 在同域名下转发 `/api/*` 与 `/uploads/*`
- PostgreSQL、Chroma 和本地上传目录都与应用同机部署
- 因为 API 进程仍负责 APScheduler，当前不允许额外再开第二个 API worker；如需扩展后台吞吐，扩容 Celery worker

移动端出包约定：

- 根目录使用 `bash scripts/mobile-release.sh build dev|prod ios|android`
- App Store / Play 提交使用 `bash scripts/mobile-release.sh submit prod ios|android`
- 上述脚本会和 `mobile/eas.json` 保持同一套 `APP_ENV` 映射，避免 profile 与运行时环境不一致

默认数据库：

- 开发库：`sparkflow`
- 测试库：`sparkflow_test`
- 默认连接串仍是 `postgresql+psycopg://sparkflow:sparkflow@127.0.0.1:5432/...`

也可以直接使用根目录脚本让数据库随联调 / 测试自动启动：

```bash
bash scripts/dev-mobile.sh
bash scripts/test-all.sh
```

正式产品登录当前走：

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`

本地联调仍保留测试入口：

- `POST /api/auth/token`

默认测试账号 `test-user-001` 会在启用 `ENABLE_TEST_AUTH=true` 时按需补齐到数据库，避免联调脚本和旧用例触发外键错误。

当前脚本生成已经升级为“三层写作上下文 + 主题 + SOP 大纲”链路，不再使用 `mode_a / mode_b` 两套独立工作流配置。

当前生成链路依赖：

- `LLM_PROVIDER` 对应的文本生成能力，用于碎片方法论离线提炼、大纲和草稿生成
- `Embedding + VectorStore`，用于检索相关知识与相关碎片
- `POST /api/scripts/generation` 的输入收敛为 `topic` + `fragment_ids`

如果你想验证“真实后端 + 当前脚本生成任务”的整条链路，可以运行：

```bash
cd backend
.venv/bin/python scripts/test_dify_script_generation.py --cleanup
```

这个联调脚本会：

- 调用 `POST /api/auth/token` 获取开发用测试 token
- 创建 1-2 条手动文本碎片
- 调用 `POST /api/scripts/generation`
- 轮询 `GET /api/tasks/{task_id}` 直到终态
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
- 轮询 `GET /api/tasks/{task_id}` 直到终态
- 成功后读取 `GET /api/scripts/{script_id}` 并输出搜索命中和脚本摘要
- 传入 `--cleanup` 时自动删除本次联调创建的知识文档、碎片和脚本

客户端只需要轮询 SparkFlow 自己的 `/api/tasks/{task_id}`，不需要感知后台每日方法论刷新、大纲生成和草稿落库的后端内部步骤。

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
   - `backend/modules/shared/infrastructure/container.py` 只负责 `ServiceContainer` 和默认依赖装配。
   - `backend/prompts/` 是当前后端 prompt 文本与模板的统一存放位置；代码层只负责读取与填充变量，不再直接内嵌长 prompt 文本。
   - `backend/modules/shared/infrastructure/infrastructure.py` 只保留兼容导出，真实实现拆到 `storage.py`、`vector_store.py`、`providers.py`。
   - `backend/modules/shared/media/audio_ingestion_use_case.py` 负责媒体导入入口编排，`backend/modules/shared/media/media_ingestion_steps.py` 负责 transcript-first 步骤执行，`backend/modules/shared/media/media_ingestion_persistence.py` 负责落库与终态输出。
   - `backend/modules/shared/media/audio_ingestion.py` 保留统一入口导出，供现有依赖平滑迁移。
   - `backend/modules/shared/tasks/runtime.py` 与 `backend/modules/shared/celery/*` 提供 Celery 任务运行时、步骤投递、重试与恢复。
   - `backend/modules/fragments/derivative_task.py` 负责 fragment 摘要、标签与向量的异步回填任务。
7. `modules/tasks`
   - 后台任务主查询层。
   - 负责 `task_runs` / `task_step_runs` 查询、步骤详情与手动重跑。
8. `core/logging_config.py`
   - 结构化日志装配层。
   - 负责 `structlog` 配置、request-id 绑定、访问日志分流、第三方 logger 降噪，以及控制台与按天轮转文件输出。

## Folder Guide

### Core entry and infra

- `main.py`: FastAPI 应用入口，负责装配 request-id 中间件、异常处理、路由和 lifespan。
- `core/`: 通用基础设施，包括配置、认证、标准响应、异常定义和结构化日志。
- `constants/`: 共享常量。
- `utils/`: 序列化、时间处理等通用工具函数。

### Business modules

- `modules/admin_users/`: 管理员账号管理。
- `modules/auth/`: 邮箱密码注册与登录、测试令牌签发、当前用户信息、刷新令牌。
- `modules/backups/`: 自动备份批量写入、快照读取、恢复会话、素材上传和访问地址刷新。
- `modules/fragment_folders/`: 碎片文件夹 CRUD 和基于 snapshot 的文件夹统计。
- `modules/fragments/`: 当前只保留标签、相似检索、可视化和 fragment snapshot 详情 / 导出组装能力。
- `modules/transcriptions/`: 音频上传与后台转写入口；主任务以 transcript 成功为准，摘要标签随后异步补齐。
- `modules/external_media/`: 外部媒体音频导入，当前支持抖音分享链接；请求入口只创建任务，解析链接、下载转 m4a、转写先在主任务完成，摘要/标签/向量由后续衍生任务回填。
- `modules/scripts/`: 口播稿生成、脚本生成任务定义、上下文构建、结果回流、列表、详情、更新、删除、每日推盘；其中 daily push 现在通过备份快照 reader 聚合 fragment 真值。
- `modules/knowledge/`: 知识库文档创建、上传、搜索、删除；当前已按 `parsers / chunking / indexing / application` 拆层，文本型上传支持 `txt/docx/pdf/xlsx`。
- `modules/debug_logs/`: 接收移动端调试日志，并通过结构化日志链路写入本地文件。
- `modules/media_assets/`: 统一媒体资源上传、列表和删除。
- `modules/exports/`: Markdown 单条导出和批量 zip 导出。
- `modules/scheduler/`: APScheduler 装配与每日推盘、写作上下文维护调度入口。
- `modules/shared/`: 模块共享端口、DI 容器、增强逻辑，不承载独立业务模块。

当前 `modules/scripts/` 内部约定：

- `application.py` 只保留查询、命令和每日推盘编排入口。
- `rag_task.py` 只负责 `rag_script_generation` 步骤定义与协调。
- `daily_push_task.py` 只负责 `daily_push_generation` 步骤定义与结果回流。
- `writing_context_builder.py` 负责预置稳定内核、缓存方法论读取、相关素材召回，以及每日碎片方法论维护任务。
- `rag_context_builder.py` 负责把三层上下文、大纲和当前碎片背景拼成最终提示词。
- `persistence.py` 负责脚本幂等落库。
- `daily_push.py` 负责每日推盘的碎片拼接和相似度筛选规则。
- `daily_push_snapshots.py` 负责从 `backup_records` 读取 fragment 快照，并规整为每日推盘专用 DTO。

当前 `modules/fragments/` 内部约定：

- `application.py` 只保留基于 fragment snapshot 的查询、标签聚合和导出详情组装。
- `mapper.py` 负责 fragment snapshot 与素材响应映射。
- `derivative_service.py` 负责摘要、标签和向量衍生同步，并把服务器生成字段直接补写回 snapshot。

### Persistence and providers

- `domains/`: 当前仍在使用的 PostgreSQL 聚合仓储，按聚合拆分 `repository.py`。
- `models/`: SQLAlchemy ORM 模型和数据库 session 工厂。
- `services/`: 外部 provider 适配器与工厂，当前包含 LLM / STT / Embedding，以及保留给实验性外挂工作流的 `DifyWorkflowProvider`。
- `prompts/`: Prompt 模板文件。

当前职责边界：

- `domains/` 只保留当前仍被业务模块直接消费的仓储包；已经下线的 `fragments / fragment_tags / fragment_blocks` 旧投影不再保留空壳 package。
- `modules/shared/fragment_snapshots.py` 与 `modules/shared/media_asset_snapshots.py` 是 snapshot-backed 读取入口，负责从 `backup_records` 还原服务端已同步真值；这类读取不再伪装成 `domains/fragments/repository.py`。
- `llm_provider` 承担碎片摘要/标签增强，以及当前脚本生成和每日推盘所需的文本生成能力。
- `workflow_provider` 当前不在主脚本生成链路上，主要保留给实验性外挂工作流接入。
- `knowledge_index_store` 是知识库索引的独立抽象；默认实现仍由 `AppVectorStore` 适配 Chroma，未来若切到 LightRAG 之类底层引擎，应优先替换这一层，而不是改 `knowledge`/`scripts` 业务模块。

### Runtime data and maintenance

- `alembic/`: 数据库迁移。
- `tests/`: `pytest` + `Schemathesis` 测试。
- `scripts/`: 后端本地辅助脚本。
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

Current business modules include `admin_users`, `auth`, `backups`, `fragment_folders`, `fragments`, `transcriptions`, `external_media`, `scripts`, `knowledge`, `media_assets`, `exports`, `tasks`, `debug_logs`, and `scheduler`.

内容字段约定：

- `fragments` 与 `scripts` 对外接口统一暴露 `body_html` 作为正文真值；导出链路再统一转换 Markdown。
- fragment 正文、转写、标签与音频句柄的服务端持久化入口已经统一收口到 `backup_records`，不再保留 `fragments` 数据库投影表。
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

本地 RabbitMQ / Celery worker 相关命令：

```bash
bash scripts/rabbitmq-local.sh start
bash scripts/rabbitmq-local.sh status
bash scripts/rabbitmq-local.sh logs
bash scripts/rabbitmq-local.sh stop
bash scripts/celery-worker.sh
```

脚本行为约定：

- `bash scripts/dev-mobile.sh` 会在 Alembic 之前自动确保本机 PostgreSQL 可用并补齐默认开发库
- `bash scripts/dev-mobile.sh` 会自动确保本机 RabbitMQ 可用，并启动独立 Celery worker；本地默认使用 `CELERY_RESULT_BACKEND=rpc://`，避免额外依赖 Redis
- `bash scripts/test-all.sh` 会在 pytest 之前自动确保 `sparkflow_test` 可用
- 开发库是否跳过本机默认库初始化由 `DATABASE_URL` 控制；测试库是否跳过本机默认库初始化只由 `TEST_DATABASE_URL` 控制

任务与工作流相关接口：

- `POST /api/scripts/generation`
- `GET /api/tasks/{task_id}`
- `GET /api/tasks/{task_id}/steps`
- `POST /api/tasks/{task_id}/retry`

当前接入策略：

- `POST /api/transcriptions` / `POST /api/external-media/audio-imports` / `POST /api/scripts/generation` / `POST /api/scripts/daily-push/trigger` / `POST /api/scripts/daily-push/force-trigger` 现在都会先创建 `task_runs`
- `POST /api/knowledge/upload` 在 `reference_script` 场景下也会附带统一任务句柄
- `GET /api/tasks/{task_id}` / `GET /api/tasks/{task_id}/steps` / `POST /api/tasks/{task_id}/retry` 提供统一后台任务观察与补偿入口
- `POST /api/external-media/audio-imports` 不再同步解析或下载媒体；`resolve_external_media` / `download_media` 也属于 `media_ingestion` task 步骤
- `media_ingestion` 当前固定步骤为 `resolve_external_media`（按需）、`download_media`、`transcribe_audio`、`finalize_fragment`；`GET /api/tasks/{task_id}` 成功时允许 `summary=null`、`tags=[]`
- transcript 落库后会最佳努力创建内部 `fragment_derivative_backfill` task，异步执行摘要、标签和向量回填；该回填现在支持只有 `local_fragment_id`、没有 `Fragment` projection 的 local-first 路径，失败也不会回滚已成功的 ingest
- SparkFlow 后端先收集预置稳定内核、已缓存方法论、相关素材和可选碎片背景，再生成大纲与草稿
- `rag_script_generation` task 依次执行 `generate_outline`、`retrieve_examples`、`generate_script_draft`、`persist_script`
- `task_runs` / `task_step_runs` 是后台状态事实源
- `agent_runs` 与 `/api/agent/*` 已移除，脚本生成公开链路完全收口到 `scripts + tasks`

任务态客户端约定：

- `POST /api/transcriptions` 返回 `task_id`、`task_type`、`status_query_url`，以及按路径不同返回的 `fragment_id` 或 `local_fragment_id`
- `POST /api/transcriptions` 与 `POST /api/external-media/audio-imports` 现在要求 `local_fragment_id` 必填，调用前必须先在客户端创建本地占位 fragment
- `POST /api/external-media/audio-imports` 请求体支持 `share_url`、`platform` 和可选 `folder_id`，返回统一任务句柄与 `fragment_id`
- `POST /api/scripts/generation` 返回 `task_id`、`task_type`、`status_query_url`、`status`
- `POST /api/scripts/daily-push/trigger` / `POST /api/scripts/daily-push/force-trigger` 返回 `task_id`、`task_type`、`status_query_url`、`status`
- `GET /api/scripts` / `GET /api/scripts/{script_id}` 在没有来源碎片时会稳定返回 `source_fragment_ids=[]` 与 `source_fragment_count=0`，不使用 `null`
- 文件类响应不再暴露 `audio_path` / `storage_path`，统一返回签名 `*_file_url` 与过期时间
- `fragments.transcript` 表示机器转写原文，`body_html` 表示用户整理后的正式正文；正文消费统一按 `body_html -> transcript` 回退
- 手动文本碎片主链路已不再依赖 `POST /api/fragments*` 远端建单；客户端应先写本地真值，再通过 `/api/backups/*` 同步快照，`transcript` 仅保留给语音转写链路
- 客户端应轮询 `/api/tasks/{task_id}`，在成功后再读取 `fragment_id`、`local_fragment_id` 或 `script_id`；对 transcript 任务来说，首个成功仅保证 transcript 已可用，`summary` / `tags` 可能由后续 derivative task 异步补齐
- 当前后端已移除 `GET /api/transcriptions/{fragment_id}`、`GET /api/fragments` 与 `GET /api/fragments/{fragment_id}` 这三条兼容读取接口；状态查询统一走 `task_id -> /api/tasks/{task_id}`，fragment 主读取统一走移动端本地真值
- 手动脚本生成在客户端发起 `POST /api/scripts/generation` 之前，需要先完成一次成功的 backup flush；后端只消费已同步成功的 fragment snapshot，不读取设备上尚未上传的正文
- 外链导入成功后的 `platform`、`share_url`、`media_id`、`title`、`author`、`cover_url`、`content_type`、`audio_file_url` 统一从 `GET /api/tasks/{task_id}` 的 `output` 读取
- 当前移动端已切脚本生成任务态；外链导入也已接入底部 `+` 抽屉、导入页和任务态轮询

## Frontend Debug Logs

运行时日志现在会同时：

- 开发态控制台默认只显示应用 `WARNING+`，并关闭 Uvicorn 内建 access log
- 后端全量业务日志写入 [`backend/runtime_logs/backend.log`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/runtime_logs/backend.log)
- 后端 `ERROR` 及以上日志额外写入 [`backend/runtime_logs/backend-error.log`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/runtime_logs/backend-error.log)
- 移动端上报的调试日志保存在 App 内错误日志页中
- 移动端调试日志通过专用 file handler 写入 [`backend/runtime_logs/mobile-debug.log`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/runtime_logs/mobile-debug.log)
- 三类日志文件都按本地午夜切分并默认保留最近 7 天

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

排查建议：

- 先看 [`backend/runtime_logs/backend-error.log`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/runtime_logs/backend-error.log) 找 5xx、未处理异常和 `http_request_failed`
- 再看 [`backend/runtime_logs/backend.log`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/runtime_logs/backend.log) 关联 `http_request_completed`、业务事件和 request-id
- 移动端真机/模拟器异常最后看 [`backend/runtime_logs/mobile-debug.log`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/runtime_logs/mobile-debug.log)

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
