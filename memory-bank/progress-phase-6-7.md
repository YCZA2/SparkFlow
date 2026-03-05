# SparkFlow — 阶段 6-7: 语音转写与 AI 自动摘要/标签 ✅ 已完成

> 最后更新：2026-03-05

---

## 阶段 6：语音转写集成 (STT)

### 任务清单

| 步骤 | 任务 | 状态 |
|------|------|------|
| 6.1 | 配置外部 API 密钥管理 | ✅ 已完成 |
| 6.2 | 实现 STT 服务封装 (阿里云百炼/灵积平台 paraformer) | ✅ 已完成 |
| 6.3 | 上传后自动转写并创建碎片 | ✅ 已完成 |
| 6.4 | 前端录音全流程联调 | ✅ 已完成 |

### 6.1 外部 API 密钥管理

**配置项** (`.env`):

```bash
# 阿里云 DashScope (LLM + STT 共用)
DASHSCOPE_API_KEY=sk-...

# 阿里云 NLS (传统方式备选)
ALIBABA_CLOUD_ACCESS_KEY_ID=...
ALIBABA_CLOUD_ACCESS_KEY_SECRET=...
ALIBABA_CLOUD_APP_KEY=...
```

**依赖**:
```bash
pip install dashscope httpx
```

**实现状态**: ✅ 已完成
- `core/config.py` 使用 pydantic-settings 从 `.env` 加载配置
- `services/dashscope_stt.py` 已实现，使用阿里云百炼 paraformer-v2 模型
- `requirements.txt` 已补充 `httpx==0.28.1`

### 6.2 STT 服务封装

**文件**: `backend/services/dashscope_stt.py`

**实现要点**:
- 使用阿里云百炼/灵积平台 paraformer-v2 模型
- 支持 `.m4a`, `.wav`, `.mp3` 等常见格式
- 自动处理 Token 获取和过期刷新

**函数签名**:
```python
async def transcribe(audio_path: str) -> str:
    """转写音频文件为文本"""
    pass

async def transcribe_bytes(audio_bytes: bytes, format: str = "m4a") -> str:
    """转写字节数组为文本"""
    pass
```

### 6.3 自动转写流程

**修改端点**: `POST /api/transcribe/`

**流程**:
```
上传音频文件 → 保存到磁盘 → 调用 STT 转写
                                    ↓
创建碎片记录 ← 更新 transcript ← 返回转写结果
```

**错误重试机制**:
- 转写失败时自动重试 2 次（指数退避：1秒、3秒）
- 重试全部失败后，记录状态为 `sync_status='failed'`
- 返回错误但保留音频文件，可稍后重试

**新增后台任务**: `transcribe_with_retry()`
- 使用 `asyncio.create_task()` 实现真正的异步处理
- 后台任务中创建独立的数据库会话
- 转写完成后自动更新碎片记录

### 6.4 前端全流程联调

**状态**: ✅ 已完成

**实现文件**: `mobile/app/(tabs)/index.tsx`

**流程**:
```
点击录音 → 停止录音 → 自动上传音频
    ↓
等待转写 → 显示转写结果 → 自动刷新碎片列表
```

**完成功能**:
- 修复 DashScope STT 语音识别接口 (`dashscope_stt.py`)
- 实现音频上传后自动后台转写
- 转写状态实时查询 (`GET /api/transcribe/status/{fragment_id}`)
- 上传进度和状态显示（上传中、成功、失败）
- 网络错误处理和重试机制

**验证结果**:
- 音频文件正确保存到 `uploads/{user_id}/{uuid}.m4a`
- 碎片记录正确创建，`sync_status` 状态流转正常
- 转写文本正确写入 `fragments.transcript` 字段

---

## 阶段 7：AI 自动摘要与标签

### 任务清单

| 步骤 | 任务 | 状态 |
|------|------|------|
| 7.1 | 实现 LLM 服务封装 | ✅ 已完成 |
| 7.2 | 实现自动摘要生成函数 | ✅ 已完成 |
| 7.3 | 实现自动标签生成函数 | ✅ 已完成 |
| 7.4 | 在转写流程中串联摘要和标签 | ✅ 已完成 |
| 7.5 | 前端碎片卡片显示摘要和标签 | ✅ 已完成 |

### 7.1 LLM 服务封装

**文件**: `backend/services/qwen_llm.py`

**依赖**:
```bash
pip install dashscope
```

**函数签名**:
```python
async def generate(
    system_prompt: str,
    user_message: str,
    temperature: float = 0.7,
    max_tokens: int = 2000
) -> str:
    """调用通义千问生成文本"""
    pass

async def health_check() -> bool:
    """检查服务健康状态"""
    pass
```

**实现状态**: ✅ 已完成
- 使用 `dashscope.Generation.call()` 方法
- 支持流式输出（可选，用于优化体验）
- 自动处理 API 限流和错误

### 7.2 自动摘要生成

**文件**: `backend/services/llm_service.py`

**Prompt 设计**:
```
你是一个专业的内容摘要助手。根据用户提供的口述内容，生成一句简短的中文摘要（20字以内）。
只返回摘要文本，不要有其他说明。
```

**函数签名**:
```python
async def generate_summary(transcript: str, llm_service=None) -> str:
    """生成转写内容的一句话摘要（20字以内）"""
    pass
```

**实现要点**:
- 使用温度 0.3 确保输出稳定
- 最大 token 数 50
- 包含后备方案：LLM 失败时返回文本前 15 字符

**验证测试** (2026-03-05):
- 输入: "我今天突然想到做定位其实最重要的就是找到差异化，你要想清楚你和别人到底有什么不同，这是商业的核心"
- 输出: "定位核心是找到差异化优势" ✅

**实现状态**: ✅ 已完成

### 7.3 自动标签生成

**文件**: `backend/services/llm_service.py`

**Prompt 设计**:
```
你是一个专业的内容标签助手。根据用户提供的内容，生成 2-4 个中文标签关键词。
以 JSON 数组格式返回，如 ["标签1", "标签2", "标签3"]。
```

**函数签名**:
```python
async def generate_tags(transcript: str, llm_service=None) -> list[str]:
    """生成转写内容的标签列表（2-4个）"""
    pass
```

**实现要点**:
- 使用温度 0.3 确保输出稳定
- 最大 token 数 100
- 自动解析 JSON 数组响应
- 包含后备方案：LLM 失败时基于关键词匹配

**验证测试** (2026-03-05):
- 输入: "我今天突然想到做定位其实最重要的就是找到差异化..."
- 输出: `['商业核心', '差异化定位', '竞争优势']` ✅

**额外实现**:
- `generate_summary_and_tags()`: 并行生成摘要和标签，优化调用延迟

**实现状态**: ✅ 已完成

### 7.4 转写流程串联

**修改端点**: `POST /api/transcribe/`

**文件**: `backend/routers/transcribe.py`

**增强流程**:
```
上传音频 → 转写 → 生成摘要+标签（并行） → 更新碎片记录
```

**实现要点**:
- 在 `transcribe_with_retry()` 函数中，转写成功后调用 `generate_summary_and_tags()`
- 使用并行调用优化延迟（摘要和标签同时生成）
- 摘要/标签生成失败不影响转写结果（降级处理）
- 标签以 JSON 字符串格式存储于 `tags` 字段

**最终碎片记录包含**:
- `audio_path`: 音频文件路径
- `transcript`: 转写文本
- `summary`: AI 摘要（20字以内）
- `tags`: JSON 数组格式的标签（如 `["定位", "差异化"]`）
- `sync_status`: 'synced'

**实现状态**: ✅ 已完成

### 7.5 前端显示摘要和标签

**状态**: ✅ 已完成

**实现文件**:
- `mobile/components/FragmentCard.tsx` - 碎片卡片组件
- `mobile/app/fragment/[id].tsx` - 碎片详情页

**卡片显示逻辑**:
- **标题文本**: 优先显示 `summary`，无摘要时显示 `transcript` 前50字符
- **标签展示**: 以 Chip 样式展示标签列表，最多显示3个，多余显示 "+N"
- **标签解析**: 支持 JSON 数组格式 `["标签1","标签2"]` 和逗号分隔格式 `标签1,标签2`

**详情页显示**:
- **AI 摘要卡片**: 显示 `summary` 字段（20字以内）
- **标签卡片**: 显示完整标签列表
- **完整内容卡片**: 显示 `transcript` 转写文本

**验证结果**:
- 碎片列表卡片正确显示摘要和标签
- 详情页完整展示 AI 摘要、标签、转写文本
- 暗色模式适配正常

---

## 验证清单

### 阶段 6 验证

```bash
# 1. 验证 STT 服务
python -c "
from services import get_stt_service
stt = get_stt_service()
print('✓ STT 服务加载成功')
"

# 2. 测试转写（准备测试音频文件）
python -c "
import asyncio
from services import get_stt_service
stt = get_stt_service()
result = asyncio.run(stt.transcribe('uploads/test.m4a'))
print(f'转写结果: {result}')
"

# 3. API 端点测试（先获取 Token）
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/token \
  -H "Content-Type: application/json" -d '{}' | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

# 4. 上传音频并自动转写
curl -X POST http://localhost:8000/api/transcribe/ \
  -H "Authorization: Bearer $TOKEN" \
  -F "audio=@test.m4a"

# 5. 查询转写状态（替换 {fragment_id} 为实际返回的 ID）
# curl http://localhost:8000/api/transcribe/status/{fragment_id} \
#   -H "Authorization: Bearer $TOKEN"
```

### 阶段 7 验证

```bash
# 1. 验证 LLM 服务
python -c "
from services import get_llm_service
llm = get_llm_service()
print('✓ LLM 服务加载成功')
"

# 2. 测试摘要生成
python -c "
import asyncio
from services.llm_service import generate_summary
result = asyncio.run(generate_summary('做定位最重要的是差异化'))
print(f'摘要: {result}')
"

# 3. 测试标签生成
python -c "
import asyncio
from services.llm_service import generate_tags
result = asyncio.run(generate_tags('做定位最重要的是差异化'))
print(f'标签: {result}')
"
```

---

## 决策记录

| 日期 | 问题 | 决策 |
|------|------|------|
| 2026-03-03 | API 提供商 | 阿里云百炼/灵积平台 paraformer-v2，与 LLM 共用同一平台 |
| 2026-03-03 | 摘要长度 | 20 字以内 |
| 2026-03-03 | 标签数量 | 2-4 个中文标签 |
| 2026-03-03 | 标签格式 | JSON 数组存储于数据库 |
