# SparkFlow — 当前技术栈

> 最后更新：2026-03-09

本文档描述当前仓库实际在用的技术栈、关键依赖和本地开发方式，不再保留早期“推荐但未落地”的方案描述。

## 1. Stack Snapshot

| 层级 | 当前选型 | 备注 |
|---|---|---|
| Mobile | Expo 54 + React Native 0.81 + React 19 | `mobile/package.json` |
| Routing | expo-router 6 | Stack 路由 |
| UI | React Native Paper + 自定义 theme | 不是 Web 组件库 |
| Motion | react-native-reanimated 4 | 用于页面进入与悬浮操作条动画 |
| Audio | expo-audio | 录音、播放、录音状态管理 |
| Camera | expo-camera | 提词拍摄页 |
| Media | expo-media-library | 视频保存到系统相册 |
| Network | fetch + 自建 API client | 统一 token、错误处理 |
| Local persistence | AsyncStorage | token / user / backend base URL / fragment cache / local drafts |
| Backend | FastAPI 0.135 + Uvicorn 0.41 | 模块化单体 |
| ORM | SQLAlchemy 2.0 + Alembic | PostgreSQL migrations |
| Scheduling | APScheduler 3.11 | 每日推盘 cron |
| Async jobs | PostgreSQL task tables + in-app worker | `pipeline_runs` / `pipeline_step_runs` |
| LLM | Qwen | 默认通过 DashScope |
| STT | DashScope / Aliyun | 当前默认 DashScope |
| Embedding | Qwen text-embedding-v2 | 通过 provider factory 装配 |
| Vector DB | ChromaDB 0.6 | 本地持久化 |
| Logging | structlog | request-id 贯穿的结构化日志 |
| Test | `pytest` + `Schemathesis` + Node `--test` | 后端分层测试（smoke/contract + integration）/ 移动端少量状态测试 |

## 2. Mobile

### 2.1 Core dependencies

来自 [`mobile/package.json`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile/package.json)：

- `expo ~54.0.0`
- `react 19.1.0`
- `react-native 0.81.5`
- `expo-router ~6.0.23`
- `react-native-paper ^5.15.0`
- `react-native-reanimated ~4.1.1`
- `@react-native-async-storage/async-storage 2.2.0`
- `expo-audio ~1.1.1`
- `expo-camera ~17.0.10`
- `expo-media-library ~18.2.1`
- `expo-document-picker ~14.0.8`
- `expo-dev-client ~6.0.20`

### 2.2 Current role of each capability

- `expo-router`: 页面组织与深链导航。
- `expo-audio`: 录音、回放、音频模式切换。
- `expo-camera`: 拍摄页预览与视频录制。
- `expo-media-library`: 视频写入系统相册。
- `expo-document-picker`: 为后续知识库上传预留。
- `AsyncStorage`: 当前真正参与主流程的本地持久化，承载 fragment cache、`LocalFragmentDraft` 与待上传图片队列。

### 2.3 Current frontend architecture choice

当前移动端不是典型 tab app，而是：

- `index` 作为碎片主页
- `profile` 作为创作工作台
- 其余页面走 stack 二级流转

这和早期 PRD 里的“底部 tab 捕获 / 碎片 / 我的”已经不一致，文档与新功能都应以当前 stack 结构为准。

## 3. Backend

### 3.1 Core dependencies

来自 [`backend/requirements.txt`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/requirements.txt)：

- `fastapi==0.135.1`
- `uvicorn==0.41.0`
- `SQLAlchemy==2.0.48`
- `alembic==1.18.4`
- `pydantic==2.12.5`
- `pydantic-settings==2.8.1`
- `python-multipart==0.0.22`
- `dashscope==1.22.1`
- `chromadb==0.6.3`
- `httpx==0.28.1`
- `python-docx==1.1.2`
- `PyJWT==2.10.1`
- `APScheduler==3.11.0`
- `structlog==25.4.0`
- `psycopg[binary]==3.2.10`
- `pytest==8.3.5`
- `pytest-asyncio==0.26.0`
- `schemathesis==3.39.16`

### 3.2 Backend structure choice

当前后端结构不是早期文档里的 `routers/*.py + services/*.py` 主导模式，而是：

- `modules/*/presentation.py`: Router
- `modules/*/application.py`: Use case / orchestration
- `modules/shared/*`: container、ports、共享增强逻辑
- `modules/shared/pipeline_runtime.py`: 持久化任务运行时、worker、恢复与重跑
- `domains/*/repository.py`: 数据访问
- `services/*`: 外部 provider 与工厂

这意味着：

- 新接口入口应优先加到 `modules/*`
- 新业务逻辑应优先放 `application.py`
- 新 provider 或第三方接入再考虑进入 `services/*`

## 4. Persistence and Storage

### 4.1 Database

- 主数据库：PostgreSQL
- 默认连接串：`postgresql+psycopg://sparkflow:sparkflow@127.0.0.1:5432/sparkflow`
- ORM：SQLAlchemy
- 迁移工具：Alembic
- 后台任务表：`pipeline_runs` / `pipeline_step_runs`

### 4.2 File storage

- 音频上传目录：`backend/uploads/<user_id>/`
- 上传上限：默认 50MB
- 视频不经过后端存储，移动端直接保存到系统相册

### 4.3 Vector storage

- 向量库：ChromaDB
- 默认路径：`./chroma_data`
- 碎片 namespace：`fragments_{user_id}`
- 知识库 namespace：`knowledge_{user_id}`

## 5. AI and Provider Strategy

### 5.1 Current defaults

来自 [`backend/core/config.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/core/config.py) 与 [`backend/services/factory.py`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/services/factory.py)：

- `LLM_PROVIDER=qwen`
- `LLM_MODEL=qwen-turbo`
- `STT_PROVIDER=dashscope`
- `EMBEDDING_PROVIDER=qwen`
- `EMBEDDING_MODEL=text-embedding-v2`
- `VECTOR_DB_PROVIDER=chromadb`

### 5.2 Extensibility

代码层已经为这些扩展预留了 provider factory，但并非都已实现：

- LLM: 仅 `qwen` 可用，其他 provider 还是占位分支
- STT: `dashscope` 与 `aliyun` 可选
- Embedding: 当前仅 `qwen` 可用
- Vector DB: 当前仅 `chromadb` 可用

所以“可切换”在当前阶段更准确的理解是“接口预留完成，不代表生产可直接切换”。

## 6. Local Development

### 6.1 Recommended way

从仓库根目录启动：

```bash
bash scripts/dev-mobile.sh
```

它会同时启动：

- FastAPI backend: `8000`
- Expo / Metro: `8081`

可用 npm 别名：

```bash
npm run dev:mobile
npm run dev:mobile:start
```

### 6.2 When native build is required

如果改了 `mobile/ios`、原生配置、Expo 插件或 `app.json`：

```bash
bash scripts/dev-mobile.sh build
```

### 6.3 Backend only

```bash
cd backend
.venv/bin/python -m uvicorn main:app --reload
```

### 6.4 Tests

后端：

```bash
cd backend
.venv/bin/pytest
```

后端轻量测试：

```bash
cd backend
.venv/bin/pytest -m "not integration"
```

移动端：

```bash
cd mobile
npm run test:state
```

全仓：

```bash
bash scripts/test-all.sh
```

## 7. Networking Conventions

- App 业务接口端口：`8000`
- Expo / Metro 端口：`8081`
- 真机调试时，App 内填写的是后端地址，不是 Metro 地址

示例：

```text
http://<your-lan-ip>:8000
```

## 8. Practical Notes

- 当前项目是“本地优先 + 单机联调”形态，文档和脚本都围绕这个前提设计。
- Expo Dev Client 已接入，因此原生能力变更需要区分“只改 JS/TS”与“需要重建”两类流程。
- 移动端首页已偏向“碎片管理与创作入口”，不是最初的单一录音主页。
- 知识库后端已可用，但移动端仍是占位入口；不要把它当成完整的已交付前端模块。
