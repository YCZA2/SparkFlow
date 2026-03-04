# SparkFlow — 阶段 6-7: 语音转写与 AI 自动摘要/标签

> 最后更新：2026-03-04

---

## 阶段 6：语音转写集成 (STT)

### 任务清单

| 步骤 | 任务 | 状态 |
|------|------|------|
| 6.1 | 配置外部 API 密钥管理 | ✅ 已完成 |
| 6.2 | 实现 STT 服务封装 (阿里云百炼/灵积平台 paraformer) | ✅ 已完成 |
| 6.3 | 上传后自动转写并创建碎片 | ✅ 已完成 |
| 6.4 | 前端录音全流程联调 | ⏳ 待验证 |

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

**流程**:
```
点击录音 → 停止录音 → 自动上传音频
    ↓
等待转写 → 显示转写结果 → 自动刷新碎片列表
```

---

## 阶段 7：AI 自动摘要与标签

### 任务清单

| 步骤 | 任务 | 状态 |
|------|------|------|
| 7.1 | 实现 LLM 服务封装 | ✅ 已完成 |
| 7.2 | 实现自动摘要生成函数 | ⏳ 待实施 |
| 7.3 | 实现自动标签生成函数 | ⏳ 待实施 |
| 7.4 | 在转写流程中串联摘要和标签 | ⏳ 待实施 |
| 7.5 | 前端碎片卡片显示摘要和标签 | ⏳ 待实施 |

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

**Prompt 设计**:
```
根据以下口述内容生成一句简短的中文摘要（20字以内），描述核心主题。
只需返回摘要文本，不要有其他说明。

内容：
{transcript}
```

**函数签名**:
```python
async def generate_summary(transcript: str) -> str:
    """生成转写内容的一句话摘要"""
    pass
```

**示例**:
- 输入: "我今天突然想到做定位其实最重要的就是找到差异化..."
- 输出: "关于如何做差异化定位的思考"

### 7.3 自动标签生成

**Prompt 设计**:
```
根据以下内容生成 2-4 个中文标签关键词，以 JSON 数组格式返回。

示例输出: ["定位", "差异化", "个人品牌"]

内容：
{transcript}
```

**函数签名**:
```python
async def generate_tags(transcript: str) -> list[str]:
    """生成转写内容的标签列表"""
    pass
```

### 7.4 转写流程串联

**修改端点**: `POST /api/transcribe/`

**增强流程**:
```
上传音频 → 转写 → 生成摘要 → 生成标签 → 更新碎片记录
```

**最终碎片记录包含**:
- `audio_path`: 音频文件路径
- `transcript`: 转写文本
- `summary`: AI 摘要
- `tags`: JSON 数组格式的标签
- `sync_status`: 'synced'

### 7.5 前端显示摘要和标签

**更新**: `mobile/components/FragmentCard.tsx`

**显示逻辑**:
- 卡片标题：优先显示 `summary`，如果没有则显示 `transcript` 前50字符
- 标签展示：以 Chip/Tag 样式展示标签列表
- 详情页：完整显示摘要、标签、转写文本

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
