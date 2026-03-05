# SparkFlow — 系统架构文档

---

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

## 3. 数据层

### 3.1 数据库 Schema

#### 用户表
```sql
CREATE TABLE users (
    id            TEXT PRIMARY KEY,     -- UUID
    role          TEXT DEFAULT 'user',  -- 'user' | 'creator'
    nickname      TEXT,
    storage_quota INTEGER DEFAULT 1073741824,  -- 预留：存储配额(字节)，默认1GB
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 碎片笔记表
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

#### 口播稿表
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

#### 知识库文档表
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

#### Agent预留表
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

## 4. 后端架构

### 4.1 目录结构

```
backend/
├── main.py                        # FastAPI入口
├── core/                          # 核心基础设施
│   ├── __init__.py               # 导出 settings, success_response, error_response, AppException
│   ├── auth.py                   # JWT鉴权 (create_access_token, get_current_user)
│   ├── config.py                 # Pydantic Settings 配置管理
│   ├── exceptions.py             # 业务异常层次结构
│   └── response.py               # 统一API响应格式
├── routers/                       # API路由
│   ├── __init__.py
│   ├── auth.py                   # 认证路由 (/api/auth/*)
│   ├── fragments.py              # 碎片笔记CRUD (/api/fragments/*)
│   ├── knowledge.py              # 知识库管理 (/api/knowledge/*)
│   ├── scripts.py                # AI合稿 (/api/scripts/*)
│   └── transcribe.py             # 语音转写与上传 (/api/transcribe/*)
├── services/                      # 业务逻辑与服务实现
│   ├── __init__.py               # 导出工厂函数 (create_*, get_*)
│   ├── base/                     # 抽象接口层
│   │   ├── __init__.py          # 导出所有基类
│   │   ├── base_llm.py          # LLM抽象接口
│   │   ├── base_stt.py          # 语音识别抽象接口
│   │   ├── base_embedding.py    # Embedding抽象接口
│   │   └── base_vector_db.py    # 向量数据库抽象接口
│   ├── factory.py                # 服务工厂
│   ├── fragment_service.py       # 碎片笔记业务逻辑
│   ├── script_service.py         # 口播稿业务逻辑
│   ├── transcription_service.py  # 转写业务逻辑
│   ├── llm_service.py            # LLM通用服务
│   ├── qwen_llm.py              # 阿里通义千问LLM实现
│   ├── dashscope_stt.py         # 阿里云百炼/灵积STT实现 (推荐)
│   ├── aliyun_stt.py            # 阿里云NLS STT实现 (备选)
│   ├── qwen_embedding.py        # 阿里通义千问Embedding实现
│   └── chroma_vector_db.py      # ChromaDB向量数据库实现
├── models/                        # 数据模型
│   ├── __init__.py              # 导出所有模型
│   ├── database.py              # SQLAlchemy连接与会话管理
│   └── db_models.py             # 数据模型定义
├── alembic/                       # 数据库迁移
│   ├── env.py
│   └── versions/
│       └── e6b527a83de7_initial_tables.py  # 初始表结构
├── prompts/                       # AI Prompt模板
│   ├── mode_a_boom.txt          # 导师爆款模式
│   └── mode_b_brain.txt         # 专属二脑模式
├── uploads/                       # 音频文件存储 (gitignored)
│   └── {user_id}/               # 按用户分文件夹
├── chroma_data/                   # ChromaDB本地数据 (gitignored)
├── data.db                        # SQLite数据库 (gitignored)
├── seed.py                        # 测试用户种子数据脚本
└── requirements.txt               # Python依赖
```

### 4.2 服务层架构

#### 抽象基类层 (`services/base/`)

| 文件 | 功能 | 描述 |
|------|------|------|
| `base_llm.py` | LLM 统一接口 | `generate()`, `generate_stream()`, `health_check()` |
| `base_stt.py` | 语音识别统一接口 | `transcribe()`, `transcribe_bytes()` |
| `base_embedding.py` | Embedding 统一接口 | `embed()`, `embed_batch()` |
| `base_vector_db.py` | 向量数据库统一接口 | `upsert()`, `query()`, `delete()`, `health_check()` |

#### 服务工厂 (`services/factory.py`)

```python
- create_llm_service() -> BaseLLMService
- create_stt_service() -> BaseSTTService
- create_embedding_service() -> BaseEmbeddingService
- create_vector_db_service() -> BaseVectorDBService
- get_llm_service() -> 单例获取
- get_stt_service() -> 单例获取
```

#### 可切换服务实现

**LLM提供商** (通过 `LLM_PROVIDER` 环境变量):
- ✅ 阿里通义千问 (`qwen`)
- ⏳ 百度文心 (`wenxin`)
- ⏳ 智谱AI (`zhipu`)
- ⏳ OpenAI (`openai`)

**STT提供商** (通过 `STT_PROVIDER` 环境变量):
- ✅ 阿里云百炼/灵积平台 (`dashscope`)
- ✅ 阿里云NLS (`aliyun`)
- ⏳ 讯飞 (`xunfei`)
- ⏳ 百度 (`baidu`)

**向量数据库** (通过 `VECTOR_DB_PROVIDER` 环境变量):
- ✅ ChromaDB (`chromadb`)
- ⏳ Pinecone (`pinecone`)
- ⏳ Qdrant (`qdrant`)

### 4.3 API 统一响应规范

#### 响应格式

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

#### 健康检查端点

**`GET /`** - 基础健康检查
```json
{
  "success": true,
  "data": {"status": "ok", "version": "0.1.0"}
}
```

**`GET /health`** - 详细健康检查
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "0.1.0",
    "debug": true,
    "services": {
      "database": "unknown",
      "llm": "available",
      "stt": "available",
      "vector_db": "available"
    }
  }
}
```

#### 测试端点 (仅DEBUG模式)

| 端点 | 说明 |
|------|------|
| `GET /test/success` | 测试成功响应格式 |
| `GET /test/not-found` | 测试404错误响应 |
| `GET /test/validation-error` | 测试校验错误响应 |
| `GET /test/protected` | 测试JWT认证 (需Token) |
| `GET /test/auth-check` | 验证认证状态 |

### 4.4 后端环境变量配置

```bash
# 应用配置
APP_NAME=SparkFlow API
APP_VERSION=0.1.0
DEBUG=true

# 安全配置
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# 数据库
DATABASE_URL=sqlite:///./data.db

# LLM配置 (阿里云)
LLM_PROVIDER=qwen
LLM_MODEL=qwen-turbo
DASHSCOPE_API_KEY=sk-...

# STT配置 (阿里云百炼/灵积平台)
STT_PROVIDER=dashscope

# 传统阿里云NLS (备选)
ALIBABA_CLOUD_ACCESS_KEY_ID=...
ALIBABA_CLOUD_ACCESS_KEY_SECRET=...
ALIBABA_CLOUD_APP_KEY=...

# Embedding配置
EMBEDDING_PROVIDER=qwen
EMBEDDING_MODEL=text-embedding-v2

# 向量数据库
VECTOR_DB_PROVIDER=chromadb
CHROMADB_PATH=./chroma_data

# 存储配置
UPLOAD_DIR=./uploads
MAX_UPLOAD_SIZE=52428800  # 50MB
```

---

## 5. 前端架构

### 5.1 目录结构

```
mobile/
├── app/                           # expo-router文件路由
│   ├── (tabs)/                    # Tab导航组
│   │   ├── _layout.tsx           # Tab布局配置
│   │   ├── index.tsx             # 首页(录音)
│   │   ├── fragments.tsx         # 碎片库列表
│   │   └── profile.tsx           # 我的/设置
│   ├── fragment/
│   │   └── [id].tsx              # 碎片详情页 (动态路由)
│   ├── _layout.tsx               # 根布局 (PaperProvider配置)
│   ├── +not-found.tsx            # 404页面
│   ├── modal.tsx                 # 通用模态框
│   ├── network-settings.tsx      # 网络/后端地址设置
│   └── test-api.tsx              # API测试页面
├── components/                    # 可复用组件
│   ├── ErrorBoundary.tsx         # 错误边界
│   ├── ExternalLink.tsx          # 外部链接组件
│   ├── FragmentCard.tsx          # 碎片卡片组件
│   ├── StyledText.tsx            # 文本样式组件
│   ├── Themed.tsx                # 主题组件
│   ├── useColorScheme.ts         # 主题Hook
│   ├── useColorScheme.web.ts     # Web端主题Hook
│   ├── useClientOnlyValue.ts     # 客户端值Hook
│   ├── useClientOnlyValue.web.ts # Web端客户端值Hook
│   └── EditScreenInfo.tsx        # 屏幕信息编辑
├── hooks/                         # 自定义Hooks
│   ├── useAuth.ts                # 认证状态管理
│   └── useFragments.ts           # 碎片数据获取
├── utils/                         # 工具函数
│   ├── api.ts                    # API请求封装
│   ├── date.ts                   # 日期格式化
│   └── networkConfig.ts          # 网络配置与后端地址发现
├── types/                         # TypeScript类型
│   └── fragment.ts               # 碎片相关类型定义
├── constants/                     # 常量配置
│   ├── Colors.ts                 # 主题颜色
│   └── config.ts                 # API端点、存储键等配置
├── .expo/types/router.d.ts       # Expo路由类型
├── package.json
├── tsconfig.json
└── expo-env.d.ts
```

### 5.2 网络自动发现机制

#### 自动后端地址发现

**问题**：iOS模拟器使用 `localhost`，真机调试需要局域网IP，手动配置繁琐

**解决方案**：`utils/networkConfig.ts` 实现自动发现

```
启动App
    ↓
尝试已保存的后端地址
    ↓    失败
自动推断可能的后端地址列表
    ↓
并行测试各地址连通性 (/health)
    ↓
使用第一个可用地址
    ↓
保存到 AsyncStorage 供下次使用
```

**推断逻辑**：
1. 获取设备当前IP (如 `192.168.31.157`)
2. 推断同网段后端地址：`.2`, `.100`, `.101`, `.157`
3. 测试地址：`http://192.168.31.100:8000` 等
4. 同时测试模拟器地址：`localhost` (iOS) / `10.0.2.2` (Android)

#### 网络设置页面

**文件**: `app/network-settings.tsx`

**功能**:
- 显示当前配置的后端地址
- 显示设备IP和网络诊断信息
- 自动发现并重置后端地址
- 手动输入后端地址
- 测试连通性

### 5.3 认证流程

#### 测试用户方案 (MVP)

```
用户打开App
    ↓
前端检查 AsyncStorage 是否有Token
    ↓    无Token
自动调用 POST /api/auth/token (无需参数)
    ↓
后端返回固定测试用户Token (test-user-001)
    ↓
前端保存Token到 AsyncStorage
    ↓
后续请求自动携带 Authorization: Bearer <token>
```

#### Token刷新机制

```
API请求返回401
    ↓
清除本地Token
    ↓
重新调用 /api/auth/token 获取新Token
    ↓
使用新Token重试原请求
    ↓
成功: 返回数据
失败: 抛出认证错误
```

#### 认证相关API

| 端点 | 方法 | 说明 | 认证 |
|------|------|------|------|
| `/api/auth/token` | POST | 获取测试用户Token | 公开 |
| `/api/auth/me` | GET | 获取当前用户信息 | Bearer |
| `/api/auth/refresh` | POST | 刷新Token | Bearer |

### 5.4 前端配置

**文件**: `constants/config.ts`

```typescript
// API端点定义
API_ENDPOINTS = {
  AUTH: { TOKEN: '/api/auth/token', ME: '/api/auth/me' },
  FRAGMENTS: '/api/fragments',
  TRANSCRIBE: '/api/transcribe',
  // ...
}

// 存储键名
STORAGE_KEYS = { TOKEN: '@auth_token', BACKEND_URL: '@backend_url' }
```

---

## 6. 业务流程

### 6.1 录音转写流程 (已实现)

```
[前端录音] → [m4a本地暂存] → [自动上传后端]
                                    ↓
                         [创建碎片记录, sync_status='syncing']
                                    ↓
                         [后台异步任务: transcribe_with_retry()]
                                    ↓
                         [调用 DashScope STT 转写]
                                    ↓
                    ┌───────────────┼───────────────┐
                    ↓               ↓               ↓
                [转写成功]      [转写失败]      [重试机制]
                    ↓               ↓               ↓
         [sync_status='synced']  [指数退避]     [最多2次重试]
                    ↓               ↓               ↓
         [返回 transcript]     [sync_status='failed']
```

**实现细节**:
- 使用 `asyncio.create_task()` 实现真正的异步后台转写
- 指数退避重试机制：1秒、3秒
- 转写状态可通过 `GET /api/transcribe/status/{fragment_id}` 查询
- 支持音频格式：.m4a, .wav, .mp3, .aac
- 文件存储路径：`uploads/{user_id}/{uuid}.m4a`

**MVP阶段**：在线-only，暂不支持离线队列

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

## 7. 扩展性与预留

### 7.1 预留扩展点

| 功能 | 预留位置 | 实现状态 |
|------|---------|---------|
| RBAC多角色 | `users.role` | 字段预留，当前硬编码 `user` |
| 创作者市场 | `agents` 表 | 表结构预留，功能未实现 |
| 悬浮提词器 | `app.json` 权限配置 | 预留overlay权限申请 |
| 视频链接解析 | `fragments.source='video_parse'` | 字段预留，API预留 |
| 存储配额 | `users.storage_quota` | 字段预留，未启用检查 |
| LLM切换 | `factory.py:create_llm_service()` | ✅ 接口预留，当前仅实现qwen |
| STT切换 | `factory.py:create_stt_service()` | ✅ 支持dashscope/aliyun，通过环境变量切换 |
| 向量库切换 | `factory.py:create_vector_db_service()` | ✅ 接口预留，当前仅实现chromadb |

---

## 8. 开发环境依赖

### 8.1 系统级依赖

| 依赖 | 版本 | 用途 | 安装路径 |
|------|------|------|---------|
| Python | 3.12.10 | FastAPI 后端运行时 | `/opt/homebrew/bin/python3.12` |
| Node.js | v24.3.0+ | Expo 前端运行时 | `$(which node)` |
| Watchman | 2025.05.19.00+ | 文件监听（React Native 热更新） | `$(which watchman)` |
| Xcode CLT | macOS 自带 | iOS 模拟器和真机编译 | `/Library/Developer/CommandLineTools` |

### 8.2 为什么需要这些依赖

- **Python 3.12**: FastAPI 和机器学习 SDK 的运行环境。使用 3.12 而非系统自带 3.9 以获得更好的类型提示和性能优化。
- **Watchman**: Meta 开发的文件监听服务，React Native 用于检测代码变更并触发热重载。
- **Xcode Command Line Tools**: 包含编译 iOS 应用所需的编译器、链接器和调试工具。真机测试必需。

### 8.3 验证命令

```bash
# 一键验证所有依赖
/opt/homebrew/bin/python3.12 --version && \
node --version && \
watchman --version && \
xcode-select -p
```
