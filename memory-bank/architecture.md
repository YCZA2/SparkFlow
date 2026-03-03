# SparkFlow — 系统架构文档

## 1. 整体架构

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
│  │          │ │ (定时聚合) │ │ SQLAlchemy    │  │
│  └────┬─────┘ └──────────┘ └────────────────┘  │
│       │                                         │
└───────┼─────────────────────────────────────────┘
        │
┌───────┼─────────────────────────────────────────┐
│    外部 API                                      │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ LLM      │ │ STT      │ │ ChromaDB       │  │
│  │ 阿里/百度 │ │ 阿里/讯飞 │ │ (本地向量库)    │  │
│  │ /智谱    │ │ /百度    │ │                │  │
│  └──────────┘ └──────────┘ └────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## 2. 核心设计原则

### 2.1 本地优先 (Local-First)
- **SQLite**: 零配置，单文件存储，未来可无缝迁移到 PostgreSQL
- **ChromaDB**: 本地向量数据库，无需网络依赖，数据完全自主可控
- **离线支持**: 录音无网络时本地暂存，恢复后自动上传

### 2.2 可替换的服务层
所有外部服务通过抽象基类封装，可在 `.env` 中切换实现：

| 能力 | 当前实现 | 可切换至 |
|------|---------|---------|
| LLM | 阿里通义千问 (qwen) | 百度文心、智谱 AI、OpenAI |
| STT | 阿里云百炼/灵积平台 (paraformer) | 讯飞、百度、OpenAI Whisper |
| 向量数据库 | ChromaDB (本地) | Pinecone, Qdrant Cloud |

### 2.3 数据隔离
- **用户隔离**: 所有数据表通过 `user_id` 外键隔离
- **向量隔离**: ChromaDB 按用户创建独立 Collection (`docs_{user_id}`)
- **文件隔离**: 音频文件按用户分文件夹存储 `uploads/{user_id}/`

---

## 3. 数据库Schema

### 3.1 用户表
```sql
CREATE TABLE users (
    id            TEXT PRIMARY KEY,     -- UUID
    role          TEXT DEFAULT 'user',  -- 'user' | 'creator'
    nickname      TEXT,
    storage_quota INTEGER DEFAULT 1073741824,  -- 预留：存储配额(字节)，默认1GB
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 碎片笔记表
```sql
CREATE TABLE fragments (
    id            TEXT PRIMARY KEY,
    user_id       TEXT REFERENCES users(id),
    audio_path    TEXT,                 -- uploads/{user_id}/{uuid}.m4a
    transcript    TEXT,                 -- 转写文本
    summary       TEXT,                 -- AI一句话摘要
    tags          TEXT,                 -- JSON数组，AI自动标签
    source        TEXT DEFAULT 'voice', -- 'voice'|'manual'|'video_parse'
    sync_status   TEXT DEFAULT 'pending', -- 'pending'|'syncing'|'synced'|'failed'
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.3 口播稿表
```sql
CREATE TABLE scripts (
    id            TEXT PRIMARY KEY,
    user_id       TEXT REFERENCES users(id),
    title         TEXT,
    content       TEXT,                 -- 成稿内容
    mode          TEXT,                 -- 'mode_a' | 'mode_b'
    source_fragment_ids TEXT,           -- JSON数组
    status        TEXT DEFAULT 'draft', -- 'draft'|'ready'|'filmed'
    is_daily_push BOOLEAN DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.4 知识库文档表
```sql
CREATE TABLE knowledge_docs (
    id            TEXT PRIMARY KEY,
    user_id       TEXT REFERENCES users(id),
    title         TEXT,
    content       TEXT,
    doc_type      TEXT,                 -- 'high_likes'|'language_habit'
    vector_ref_id TEXT,                 -- docs_{user_id}:{doc_id}
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.5 Agent预留表
```sql
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

## 4. 目录结构

```
backend/
├── main.py                 # FastAPI入口
├── core/                   # 核心基础设施
│   ├── auth.py            # JWT鉴权
│   ├── response.py        # 统一响应格式
│   ├── exceptions.py      # 业务异常定义
│   └── config.py          # 配置加载
├── routers/               # API路由
│   ├── auth.py            # 登录/Token
│   ├── fragments.py       # 碎片笔记CRUD
│   ├── scripts.py         # AI合稿（双核Agent）
│   ├── knowledge.py       # 知识库管理
│   └── transcribe.py      # 语音转写
├── services/              # 业务逻辑
│   ├── base/              # 抽象接口层
│   │   ├── base_llm.py
│   │   ├── base_stt.py
│   │   └── base_vector_db.py
│   ├── qwen_llm.py        # 阿里通义千问实现
│   ├── dashscope_stt.py   # 阿里云百炼/灵积平台语音识别实现
│   ├── aliyun_stt.py      # 阿里云 NLS 语音识别实现 (备选)
│   ├── chroma_vector_db.py # ChromaDB实现
│   ├── llm_service.py     # LLM高层封装
│   ├── stt_service.py     # STT高层封装
│   ├── vector_service.py  # 向量库操作
│   └── scheduler.py       # APScheduler定时任务
├── models/
│   ├── database.py        # SQLAlchemy连接
│   └── db_models.py       # 数据模型
├── prompts/
│   ├── mode_a_boom.txt    # 导师爆款模式Prompt
│   └── mode_b_brain.txt   # 专属二脑模式Prompt
├── uploads/               # 音频文件存储
│   └── {user_id}/         # 按用户分文件夹
├── alembic/               # 数据库迁移
├── chroma_data/           # ChromaDB本地数据
├── data.db               # SQLite数据库
└── requirements.txt

mobile/
├── app/                   # expo-router文件路由
│   ├── (tabs)/            # Tab导航
│   │   ├── index.tsx      # 首页(录音)
│   │   ├── fragments.tsx  # 碎片库
│   │   └── profile.tsx    # 我的
│   ├── fragment/
│   │   └── [id].tsx       # 碎片详情
│   ├── generate.tsx       # AI生成页面
│   ├── script/
│   │   └── [id].tsx       # 口播稿详情
│   └── shoot.tsx          # 拍摄页面
├── components/            # 可复用组件
│   ├── TeleprompterOverlay.tsx
│   ├── FragmentCard.tsx
│   └── ScriptCard.tsx
├── hooks/                 # 自定义Hooks
│   ├── useAuth.ts
│   ├── useRecording.ts
│   └── useApi.ts
├── utils/
│   └── api.ts             # API请求封装
└── constants/
    └── config.ts          # 前端配置
```

---

## 5. API统一响应规范

```typescript
// 成功响应 (HTTP 200)
{
  "success": true,
  "data": { ... },
  "message": null
}

// 错误响应 (HTTP 4xx/5xx)
{
  "success": false,
  "data": null,
  "error": {
    "code": "FRAGMENT_NOT_FOUND",
    "message": "碎片笔记不存在或无权访问",
    "details": null
  }
}
```

---

## 6. 关键业务流程

### 6.1 录音转写流程
```
[录音] → [m4a本地暂存] → [检测网络]
    ↓
    有网络 → [上传后端] → [百炼/灵积平台STT转写] → [LLM摘要+标签] → [入库] → [synced]
    ↓
    无网络 → [SQLite队列] → [sync_status=pending] → [网络恢复自动上传]
```

### 6.2 AI口播稿生成流程

```
[多选碎片] → [获取transcript列表] → [选择模式]
    ↓
    mode_a (导师爆款) → [读取mode_a_boom.txt] → [LLM生成] → [入库scripts]
    mode_b (专属二脑) → [检索知识库相似片段] → [读取mode_b_brain.txt] → [LLM生成] → [入库]
```

**Mode B 知识库检索逻辑：**
- 使用碎片内容作为查询文本，检索用户知识库中最相似的 3 段文本
- 知识库为空时退化为自由发挥模式
- 检索结果作为 LLM system prompt 的补充上下文，实现"学习用户风格"

### 6.3 每日灵感聚合流程
```
APScheduler (每天8:00)
    ↓
[查询昨日碎片≥3条的用户]
    ↓
[合并transcript] → [Mode A生成口播稿] → [is_daily_push=true] → [本地Push通知]
```

---

## 7. 预留扩展点

| 功能 | 预留位置 | 实现状态 |
|------|---------|---------|
| RBAC多角色 | `users.role` | 字段预留，当前硬编码 `user` |
| 创作者市场 | `agents` 表 | 表结构预留，功能未实现 |
| 悬浮提词器 | `app.json` 权限配置 | 预留overlay权限申请 |
| 视频链接解析 | `fragments.source='video_parse'` | 字段预留，API预留 |
| 存储配额 | `users.storage_quota` | 字段预留，未启用检查 |

---

## 附录 A：开发环境依赖

### A.1 系统级依赖（阶段 0.1）

| 依赖 | 版本 | 用途 | 安装路径 |
|------|------|------|---------|
| Python | 3.12.10 | FastAPI 后端运行时 | `/opt/homebrew/bin/python3.12` |
| Node.js | v24.3.0+ | Expo 前端运行时 | `$(which node)` |
| Watchman | 2025.05.19.00+ | 文件监听（React Native 热更新） | `$(which watchman)` |
| Xcode CLT | macOS 自带 | iOS 模拟器和真机编译 | `/Library/Developer/CommandLineTools` |

### A.2 为什么需要这些依赖

- **Python 3.12**: FastAPI 和机器学习 SDK 的运行环境。使用 3.12 而非系统自带 3.9 以获得更好的类型提示和性能优化。
- **Watchman**: Meta 开发的文件监听服务，React Native 用于检测代码变更并触发热重载。
- **Xcode Command Line Tools**: 包含编译 iOS 应用所需的编译器、链接器和调试工具。真机测试必需。

### A.3 验证命令

```bash
# 一键验证所有依赖
/opt/homebrew/bin/python3.12 --version && \
node --version && \
watchman --version && \
xcode-select -p
```
