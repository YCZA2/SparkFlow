# SparkFlow Backend

SparkFlow 的 FastAPI 后端，当前采用模块化单体结构，默认以本地 SQLite + ChromaDB + 本地文件存储联调。

## Quick Start

1. Create venv and install dependencies.
2. Configure `.env` (see `.env.example`).
3. Start server:

```bash
uvicorn main:app --reload
```

Default local address: `http://127.0.0.1:8000`

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

## Folder Guide

### Core entry and infra

- `main.py`: FastAPI 应用入口，负责装配中间件、异常处理、路由和 lifespan。
- `core/`: 通用基础设施，包括配置、认证、标准响应、异常定义。
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
- `modules/debug_logs/`: 接收移动端调试日志并落盘到本地文件。
- `modules/scheduler/`: APScheduler 装配与每日推盘调度入口。
- `modules/shared/`: 模块共享端口、DI 容器、增强逻辑，不承载独立业务模块。

### Persistence and providers

- `domains/`: 各业务领域仓储，按聚合拆分 repository。
- `models/`: SQLAlchemy ORM 模型和数据库 session 工厂。
- `services/`: 外部 provider 适配器与工厂，主要是 LLM / STT / Embedding 集成。
- `prompts/`: Prompt 模板文件。

### Runtime data and maintenance

- `alembic/`: 数据库迁移。
- `tests/`: `unittest` 测试。
- `scripts/`: 后端本地辅助脚本。
- `uploads/`: 本地音频上传目录。
- `uploads/external_media/<user_id>/<platform>/`: 外部媒体导入后的音频文件。
- `chroma_data/`: 本地 ChromaDB 数据目录。
- `runtime_logs/`: 运行时日志目录，当前包含移动端错误日志文件。

### Legacy or low-priority paths

- `routers/`: 早期路由组织残留，当前主业务不再继续扩展。
- `schemas/`: 已废弃的全局 schema 目录，当前不再作为 API contract 维护目标。

## Coding Conventions

- 新增业务优先放在 `modules/<module>/`，不要继续把业务逻辑扩散到 `services/`。
- `presentation.py` 只做路由声明、依赖注入和请求/响应拼装，不写核心业务。
- `schemas.py` 是模块 API contract 的单一事实源；不要再单独维护一套全局 schema。
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

Current business modules include `auth`, `fragment_folders`, `fragments`, `transcriptions`, `external_media`, `scripts`, `knowledge`, `debug_logs`, and `scheduler`.

## Frontend Debug Logs

移动端错误日志现在会同时：

- 保存在 App 内错误日志页中
- 追加写入后端本地文件 [`backend/runtime_logs/mobile-debug.log`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/runtime_logs/mobile-debug.log)

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

Current tests are runnable with `unittest`:

```bash
cd backend
.venv/bin/python -m unittest discover -s tests -p 'test*.py'
```

## API Docs

When `DEBUG=true`:

- Swagger UI: `/docs`
- ReDoc: `/redoc`
