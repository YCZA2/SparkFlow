# SparkFlow — 阶段 2-3: 数据库模型与碎片笔记 CRUD API

> 最后更新：2026-03-04

---

## 阶段 2：数据库模型与迁移

### 任务清单

| 步骤 | 任务 | 状态 |
|------|------|------|
| 2.1 | 配置环境变量 (.env) | ✅ 已完成 |
| 2.2 | 实现全局错误处理机制 | ✅ 已完成 |
| 2.3 | 定义 SQLAlchemy 数据库连接 | ✅ 已完成 |
| 2.4 | 定义 Users 数据模型 | ✅ 已完成 |
| 2.5 | 定义 Fragments 数据模型 | ✅ 已完成 |
| 2.6 | 定义 Scripts 数据模型 | ✅ 已完成 |
| 2.7 | 定义 KnowledgeDocs 数据模型 | ✅ 已完成 |
| 2.8 | 定义 Agents 预留数据模型 | ✅ 已完成 |
| 2.9 | 初始化 Alembic 迁移系统 | ✅ 已完成 |
| 2.10 | 创建默认测试用户种子数据 | ✅ 已完成 |

### 数据库 Schema

#### Users 表

```sql
CREATE TABLE users (
    id            TEXT PRIMARY KEY,     -- UUID
    role          TEXT DEFAULT 'user',  -- 'user' | 'creator'
    nickname      TEXT,
    storage_quota INTEGER DEFAULT 1073741824,  -- 预留：1GB
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Fragments 表

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

#### Scripts 表

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

#### KnowledgeDocs 表

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

#### Agents 表（预留）

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

### 验证清单

#### 2.1 环境变量配置

```bash
python -c "from core import settings; print(f'DATABASE_URL: {settings.DATABASE_URL}')"
# 预期: DATABASE_URL: sqlite:///./data.db
```

#### 2.3-2.8 数据模型

```bash
python -c "
from models import User, Fragment, Script, KnowledgeDoc, Agent, Base
print('✓ 所有模型导入成功')
print(f'✓ 表名: {Base.metadata.tables.keys()}')
"
# 预期: dict_keys(['users', 'fragments', 'scripts', 'knowledge_docs', 'agents'])
```

#### 2.9 Alembic 迁移

```bash
# 检查当前迁移版本
alembic current
# 预期: e6b527a83de7 (head)

# 查看迁移历史
alembic history --verbose
# 预期: 显示 initial tables 迁移
```

#### 2.10 种子数据

```bash
python seed.py
# 预期: ✓ 测试用户已存在: test-user-001 (测试博主)

# 验证数据库
sqlite3 data.db "SELECT id, nickname, role FROM users;"
# 预期: ('test-user-001', '测试博主', 'user')
```

---

## 阶段 3：碎片笔记 CRUD API

### 任务清单

| 步骤 | 任务 | 状态 |
|------|------|------|
| 3.1 | 创建 Fragments 路由文件并注册 | ✅ 已完成 |
| 3.2 | 实现创建碎片笔记 POST 端点 | ✅ 已完成 |
| 3.3 | 实现获取碎片列表 GET 端点 | ✅ 已完成 |
| 3.4 | 实现获取单条碎片详情 GET 端点 | ✅ 已完成 |
| 3.5 | 实现删除碎片 DELETE 端点 | ✅ 已完成 |

### API 端点

| 端点 | 方法 | 说明 | 认证 |
|------|------|------|------|
| `/api/fragments/` | POST | 创建碎片笔记 | Bearer Token |
| `/api/fragments/` | GET | 获取碎片列表（分页） | Bearer Token |
| `/api/fragments/{id}` | GET | 获取碎片详情 | Bearer Token |
| `/api/fragments/{id}` | DELETE | 删除碎片 | Bearer Token |

### 验证清单

```bash
# 1. 获取测试用户 Token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/token \
  -H "Content-Type: application/json" -d '{}' | \
  grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
echo "Token: $TOKEN"

# 2. 创建碎片笔记
curl -X POST http://localhost:8000/api/fragments/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"transcript": "今天想到了一个关于定位的好点子", "source": "voice"}'
# 预期: {"success": true, "data": {"id": "...", ...}, "message": "碎片笔记创建成功"}

# 3. 获取碎片列表
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/fragments/
# 预期: {"success": true, "data": {"items": [...], "total": 1, ...}}

# 4. 获取单条碎片详情
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/fragments/<fragment_id>
# 预期: {"success": true, "data": {"id": "...", "transcript": "...", ...}}

# 5. 删除碎片
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/fragments/<fragment_id>
# 预期: HTTP 204 No Content
```

---

## 决策记录

| 日期 | 问题 | 决策 |
|------|------|------|
| 2026-03-05 | 服务层架构 | 提取业务逻辑到独立的 service 模块（fragment_service.py），路由层保持轻量 |
| 2026-03-02 | sync_status 默认值 | `'pending'`（离线优先，上传成功后变为 `'synced'`） |
| 2026-03-02 | 音频存储路径 | `uploads/{user_id}/{uuid}.m4a` |
| 2026-03-02 | 测试用户方案 | 单用户简化，硬编码 `test-user-001` |
