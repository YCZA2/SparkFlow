# SparkFlow — 阶段 11-14: 知识库、向量数据库、每日推盘与全流程验证

> 最后更新：2026-03-06

---

## 阶段 11：知识库基础

### 任务清单

| 步骤 | 任务 | 状态 |
|------|------|------|
| 11.1 | 实现知识库文档上传 API | ✅ 已完成 |
| 11.2 | 实现知识库文档列表 API | ✅ 已完成 |
| 11.3 | 实现文件上传解析 (TXT/Word) | ✅ 已完成 |
| 11.4 | 前端知识库管理入口 | ⏭️ **跳过** |

> **决策记录 (2026-03-06)**: 跳过阶段 11.4 前端知识库管理入口，原因：
> - 知识库功能的产品思路尚未完全明确
> - 向量数据库可以独立实施，不依赖前端入口
> - 优先保障阶段 12 碎片语义检索能力，支持每日推盘功能
> - 知识库前端可在产品思路清晰后补充

### 11.4 跳过说明

原计划的前端入口包括：
- "我的方法论"入口按钮
- 知识库列表页面
- 添加文档（粘贴文本或上传文件）

**当前状态**: 后端 API 已完备，前端入口待产品思路明确后实施。

### 架构设计

**路由层与服务层分离**:
- **路由层** (`routers/knowledge.py`): 负责 HTTP 请求处理、参数验证、调用服务层
- **服务层** (`services/knowledge_service.py`): 封装业务逻辑、数据库操作、文件解析

这种分离模式与 `fragment_service` 和 `script_service` 保持一致，符合项目架构规范。

### 11.1 知识库文档上传 API

**文件**:
- `backend/routers/knowledge.py` - 路由层
- `backend/services/knowledge_service.py` - 服务层

**端点**:
- `POST /api/knowledge` - JSON 方式上传
- `POST /api/knowledge/upload` - 文件上传方式（支持 .txt 和 .docx）

**请求体 (JSON 方式)**:
```json
{
  "title": "我的高赞文案合集",
  "content": "这是一段很长的文案内容...",
  "doc_type": "high_likes"
}
```

**doc_type 枚举**:
- `'high_likes'` - 高赞文案
- `'language_habit'` - 语言习惯记录

**功能**:
- ✅ 创建知识库文档记录到 SQLite
- ✅ 自动关联当前用户
- ✅ 验证文档类型有效性
- ✅ 返回统一格式的成功响应

**验证测试**:
- [ ] 使用 Swagger UI 测试 JSON 方式上传
- [ ] 测试文件上传方式（.txt 和 .docx）
- [ ] 验证数据库记录正确创建

### 11.2 知识库文档列表 API

**端点**: `GET /api/knowledge`

**功能**:
- ✅ 返回当前用户的所有知识库文档列表
- ✅ 支持按 doc_type 过滤
- ✅ 支持分页（limit/offset）
- ✅ 按创建时间降序排列

**额外端点**:
- `GET /api/knowledge/{doc_id}` - 获取单个文档详情
- `DELETE /api/knowledge/{doc_id}` - 删除文档

### 11.3 文件上传解析

**支持格式**:
- `.txt` - 直接读取 UTF-8 编码文本
- `.docx` - 使用 `python-docx` 库提取文本

**依赖**:
```bash
pip install python-docx==1.1.2
```

**实现细节**:
- ✅ 自动检测文件扩展名
- ✅ 使用临时文件处理 .docx 文件
- ✅ 验证文件内容非空
- ✅ 错误处理：编码错误、解析失败、缺少依赖

### 11.4 前端知识库管理入口

**文件**: `mobile/app/(tabs)/profile.tsx`（添加入口）

**功能**:
- "我的方法论"入口按钮
- 知识库列表页面
- 添加文档（粘贴文本或上传文件）

---

## 阶段 12：向量数据库集成（碎片语义检索）

> **方向调整 (2026-03-06)**: 基于跳过阶段 11 前端的决策，阶段 12 调整为聚焦**碎片语义检索**，优先支持：
> 1. 每日推盘的碎片语义关联检查
> 2. Mode B 的历史碎片风格参考
>
> 知识库文档向量化移至可选任务（12.5）

### 任务清单

| 步骤 | 任务 | 状态 | 优先级 |
|------|------|------|--------|
| 12.1 | 碎片自动向量化 | ✅ 已完成 | P0 |
| 12.2 | 碎片语义相似度查询 | ✅ 已完成 | P0 |
| 12.3 | Mode B 检索历史碎片 | ⏳ 待实施 | P0 |
| 12.4 | 知识库文档向量化（可选） | ⏳ 待实施 | P1 |

### 12.1 碎片自动向量化

**目标**: 碎片转写成功后，自动将 `transcript` 写入向量库

**Collection 设计**:
```python
# 用户碎片独立 Collection
collection = client.get_or_create_collection(
    name=f"fragments_{user_id}",
    metadata={"user_id": user_id, "type": "fragments"}
)
```

**实现文件**:
- `backend/services/vector_service.py`
- `backend/domains/transcription/workflow.py`

**已完成能力**:
- ✅ 转写成功后自动生成 embedding 并写入 ChromaDB
- ✅ Collection 按用户隔离：`fragments_{user_id}`
- ✅ 写入 metadata：`user_id`、`fragment_id`、`source`、`summary`、`tags_json`
- ✅ 向量化失败仅记录 warning，不影响碎片同步成功

**配置前提** (`.env`):
```bash
VECTOR_DB_PROVIDER=chromadb
CHROMADB_PATH=./chroma_data
EMBEDDING_PROVIDER=qwen
EMBEDDING_MODEL=text-embedding-v2
```

### 12.2 碎片语义相似度查询

**函数签名**:
```python
async def query_similar_fragments(
    user_id: str,
    query_text: str,
    top_k: int = 5,
    exclude_ids: list[str] = None
) -> list[dict]:
    """
    检索用户历史碎片中最相似的片段
    用于：每日推盘关联检查、Mode B 风格参考
    """
    pass
```

**实现文件**:
- `backend/services/vector_service.py`
- `backend/domains/fragments/service.py`
- `backend/routers/fragments.py`

**已完成能力**:
- ✅ 新增 `POST /api/fragments/similar`
- ✅ 支持 `query_text`、`top_k`、`exclude_ids`
- ✅ 先查向量库，再回表补齐摘要、标签、来源、创建时间等字段
- ✅ 向量库中存在但数据库不存在的碎片结果会自动过滤
- ✅ 当用户命名空间不存在时返回空列表

**使用场景**:
- **每日推盘 (阶段 13)**: 检查昨日碎片与历史碎片的语义关联度
- **Mode B 生成**: 检索相似主题的历史碎片作为风格参考

### 12.3 Mode B 检索历史碎片

**实现逻辑**:
```python
# 使用选中碎片内容作为查询文本
similar_fragments = await query_similar_fragments(
    user_id, fragments_text, top_k=3, exclude_ids=selected_ids
)

# 将历史碎片添加到 system prompt
system_prompt = f"""
以下是该用户过往记录的相关灵感片段，体现了用户的表达习惯：
---
[历史碎片1]
---
[历史碎片2]
---

请结合以上参考片段的语言风格，将以下灵感碎片整合为口播稿...
"""
```

**降级处理**:
- 历史碎片少于 3 条：退化为基于当前碎片的自由发挥
- 相似度均低于阈值：忽略历史参考

### 12.4 知识库文档向量化（可选）

**状态**: ⏳ 待实施（优先级 P1，时间允许时再做）

**原设计**:
- Collection 命名: `docs_{user_id}`
- 长文档需分 chunk 处理
- Mode B 可同时检索碎片和知识库两个 Collection

**实施前提**: 阶段 11 前端知识库入口完成后

---

## 阶段 13：每日灵感推盘

### 任务清单

| 步骤 | 任务 | 状态 |
|------|------|------|
| 13.1 | 实现每日聚合逻辑函数 | ⏳ 待实施 |
| 13.2 | 配置 APScheduler 定时任务 | ⏳ 待实施 |
| 13.3 | 实现每日推盘 API 查询端点 | ⏳ 待实施 |
| 13.4 | 前端首页每日灵感卡片 | ⏳ 待实施 |

### 13.1 每日聚合逻辑

**函数**: `backend/services/scheduler.py::daily_aggregate()`

**聚合逻辑**:
1. 查询每个用户昨天（过去 24 小时）创建的碎片笔记
2. **数量检查**: 碎片数量 >= 3 条
3. **语义关联检查**: 使用向量检索检查主题相似度
4. 满足条件时，合并碎片并使用 Mode A 生成口播稿
5. 写入 `scripts` 表，`is_daily_push=true`
6. 触发本地推送通知

### 13.2 APScheduler 定时任务

**配置**:
```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler()
scheduler.add_job(
    daily_aggregate,
    trigger='cron',
    hour=8,  # 每天早上 8:00
    minute=0
)
```

**生命周期**:
- FastAPI `startup` 事件: 启动 scheduler
- FastAPI `shutdown` 事件: 关闭 scheduler

### 13.3 每日推盘 API

**端点**: `GET /api/scripts/daily-push`

**返回**: 用户最新的一条 `is_daily_push=true` 的口播稿，没有则返回 404

### 13.4 前端每日灵感卡片

**位置**: 首页（录音按钮上方）

**显示条件**: 有今日每日推盘稿件时显示

**卡片文案**: "昨天的 N 个灵感，已为您写成今日待拍脚本，去看看？"

---

## 阶段 14：收尾与全流程验证

### 任务清单

| 步骤 | 任务 | 状态 |
|------|------|------|
| 14.1 | 端到端冒烟测试 | ⏳ 待实施 |
| 14.2 | 验证数据库预留字段与架构完整性 | ⏳ 待实施 |
| 14.3 | 验证 API 完整性与安全机制 | ⏳ 待实施 |
| 14.4 | 清理与文档化 (README) | ⏳ 待实施 |

### 14.1 端到端冒烟测试

**完整用户旅程**:

1. 打开 App 首页
2. 点击录音按钮，说一段话（约 15 秒），停止录音
3. 等待上传、转写、摘要、标签自动生成完成
4. 切换到碎片库 Tab，确认新碎片出现
5. 重复录音 2 次，共创建 3 条碎片
6. 在碎片库中进入多选模式，选中 3 条碎片
7. 点击"交给 AI 编导"，选择"导师爆款模式"，生成口播稿
8. 查看生成的口播稿内容
9. 点击"一键去拍摄"
10. 提词器在相机画面上方自动滚动
11. 点击录制，录制约 10 秒，停止
12. 视频保存到相册

### 14.2 数据库预留字段验证

**验证清单**:

| 表 | 预留字段 | 用途 |
|----|----------|------|
| `users` | `role` | RBAC 多角色预留 |
| `fragments` | `source` | 数据来源标识 ('voice'\|'manual'\|'video_parse') |
| `scripts` | `is_daily_push` | 每日推盘标记 |
| `scripts` | `status` | 稿件状态 ('draft'\|'ready'\|'filmed') |
| `knowledge_docs` | `vector_ref_id` | 向量库引用 ID |
| `agents` | `status` | 创作者市场预留 |

### 14.3 API 完整性验证

**端点清单**:

| 端点 | 方法 | 鉴权 | 状态 |
|------|------|------|------|
| `/api/auth/token` | POST | 公开 | ✅ |
| `/api/auth/me` | GET | Bearer | ✅ |
| `/api/auth/refresh` | POST | Bearer | ✅ |
| `/api/transcribe/` | POST | Bearer | ✅ |
| `/api/transcribe/status/{id}` | GET | Bearer | ✅ |
| `/api/fragments/` | GET | Bearer | ✅ |
| `/api/fragments/{id}` | GET | Bearer | ✅ |
| `/api/fragments/{id}` | DELETE | Bearer | ✅ |
| `/api/scripts/generate` | POST | Bearer | ⏳ |
| `/api/scripts/` | GET | Bearer | ⏳ |
| `/api/scripts/{id}` | GET | Bearer | ⏳ |
| `/api/scripts/{id}` | PATCH | Bearer | ⏳ |
| `/api/scripts/daily-push` | GET | Bearer | ⏳ |
| `/api/knowledge/` | POST | Bearer | ⏳ |
| `/api/knowledge/` | GET | Bearer | ⏳ |

### 14.4 文档化

**需要创建的文档**:

- `backend/README.md` - 后端启动指南
- `mobile/README.md` - 前端启动指南
- 环境变量模板 `.env.example`

---

## 决策记录

| 日期 | 问题 | 决策 |
|------|------|------|
| 2026-03-06 | 阶段 11 前端入口 | **跳过** 知识库前端管理入口，产品思路明确后补充 |
| 2026-03-06 | 阶段 12 方向调整 | 聚焦**碎片语义检索**（支持每日推盘 + Mode B），知识库向量化移至可选 |
| 2026-03-03 | 每日推盘关联逻辑 | 数量 ≥3 **且** 语义相似度匹配 |
| 2026-03-03 | Mode B 知识库 | 分阶段实现：阶段 8 简化，阶段 12 增强 |
| 2026-03-03 | 向量数据隔离 | 每用户独立 Collection (`fragments_{user_id}` / `docs_{user_id}`) |
| 2026-03-03 | 定时任务 | APScheduler 足够，无需 Celery |
