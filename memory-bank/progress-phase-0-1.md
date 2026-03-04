# SparkFlow — 阶段 0-1: 环境搭建与核心架构设计

> 最后更新：2026-03-04

---

## 阶段 0：开发环境搭建

### 任务清单

| 步骤 | 任务 | 状态 |
|------|------|------|
| 0.1 | 安装系统级依赖 (Python 3.12, Node.js, Watchman, Xcode) | ✅ 已完成 |
| 0.2 | 创建项目根目录与 Git 仓库 | ✅ 已完成 |
| 0.3 | 搭建 FastAPI 后端骨架 | ✅ 已完成 |
| 0.4 | 搭建后端目录结构 | ✅ 已完成 |
| 0.5 | 创建 Expo 前端项目 | ✅ 已完成 |
| 0.6 | 验证前后端网络连通性 | ✅ 已完成 |
| 0.7 | 安装前端核心 Expo 模块 | ✅ 已完成 |
| 0.8 | 安装前端 UI 组件库 | ✅ 已完成 |

### 验证清单

#### 0.1 系统依赖验证

```bash
# Python 3.12
/opt/homebrew/bin/python3.12 --version
# 预期: Python 3.12.10

# Node.js
node --version
# 预期: v24.3.0

# Watchman
watchman --version
# 预期: 2025.05.19.00

# Xcode CLT
xcode-select -p
# 预期: /Library/Developer/CommandLineTools
```

#### 0.3 FastAPI 后端验证

```bash
cd backend
source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 测试端点
curl http://localhost:8000
# 预期: {"status":"ok"}
```

#### 0.5-0.8 前端验证

```bash
cd mobile
npx expo start --ios

# 检查依赖
grep -E "(expo-av|expo-camera|expo-media-library|expo-file-system|expo-notifications|expo-document-picker|expo-sqlite)" package.json
grep "react-native-paper" package.json
```

---

## 阶段 1：核心架构设计

### 任务清单

| 步骤 | 任务 | 状态 |
|------|------|------|
| 1.1 | 设计统一服务接口层 | ✅ 已完成 |
| 1.2 | 设计 API 统一响应规范 | ✅ 已完成 |
| 1.3 | 设计 API 鉴权机制 (JWT) | ✅ 已完成 |

### 1.1 统一服务接口层

#### 抽象基类层 (`backend/services/base/`)

| 文件 | 功能 | 描述 |
|------|------|------|
| `base_llm.py` | LLM 统一接口 | `generate()`, `generate_stream()`, `health_check()` |
| `base_stt.py` | 语音识别统一接口 | `transcribe()`, `transcribe_bytes()` |
| `base_embedding.py` | Embedding 统一接口 | `embed()`, `embed_batch()` |
| `base_vector_db.py` | 向量数据库统一接口 | `upsert()`, `query()`, `delete()`, `health_check()` |

#### 具体实现层

| 文件 | 服务 | 说明 |
|------|------|------|
| `qwen_llm.py` | 阿里通义千问 LLM | 使用 dashscope SDK |
| `dashscope_stt.py` | 阿里云百炼/灵积平台语音识别 | paraformer-v2 模型 |
| `qwen_embedding.py` | 阿里通义千问 Embedding | text-embedding-v2 |
| `chroma_vector_db.py` | ChromaDB 本地向量数据库 | 零配置本地存储 |

#### 服务工厂 (`backend/services/factory.py`)

```python
- create_llm_service() -> BaseLLMService
- create_stt_service() -> BaseSTTService
- create_embedding_service() -> BaseEmbeddingService
- create_vector_db_service() -> BaseVectorDBService
- get_llm_service() -> 单例获取
- get_stt_service() -> 单例获取
```

### 1.2 API 统一响应规范

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
    "message": "碎片笔记不存在",
    "details": null
  }
}
```

#### 核心文件

| 文件 | 内容 |
|------|------|
| `core/response.py` | `success_response()`, `error_response()` |
| `core/exceptions.py` | `AppException`, `NotFoundError`, `ValidationError`, `AuthenticationError` |

### 1.3 JWT 鉴权机制

#### 鉴权模块 (`backend/core/auth.py`)

| 函数 | 功能 |
|------|------|
| `create_access_token()` | 创建 JWT Token，默认 24 小时过期 |
| `decode_token()` | 解码并验证 Token |
| `get_current_user()` | 依赖注入获取当前用户 |
| `get_optional_user()` | 可选认证 |

#### 认证路由 (`backend/routers/auth.py`)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/auth/token` | POST | 获取测试用户 Token（硬编码 test-user-001）|
| `/api/auth/me` | GET | 获取当前用户信息 |
| `/api/auth/refresh` | POST | 刷新 Token |

### 1.1 验证清单

```bash
# 验证抽象基类
python -c "from services.base import BaseLLMService, BaseSTTService, BaseEmbeddingService, BaseVectorDBService; print('✓ 所有抽象基类加载成功')"

# 验证具体实现
python -c "
from services.qwen_llm import QwenLLMService
from services.dashscope_stt import DashScopeSTTService
from services.qwen_embedding import QwenEmbeddingService
from services.chroma_vector_db import ChromaVectorDBService
print('✓ 所有服务实现类加载成功')
"

# 验证服务工厂
python -c "
from services import create_llm_service, create_stt_service, get_llm_service, get_stt_service
print('✓ 服务工厂函数加载成功')
"

# 验证配置
python -c "
from core import settings
print(f'✓ 默认LLM Provider: {settings.LLM_PROVIDER}')
print(f'✓ 默认STT Provider: {settings.STT_PROVIDER}')
"

# 启动并测试健康检查
curl http://localhost:8000/health
# 预期: {"success": true, "data": {"version": "0.1.0", "services": {...}}}
```

---

## 新增依赖

```
pydantic-settings==2.8.1
dashscope==1.22.1
alibabacloud-nls==1.0.0
chromadb==0.6.3
PyJWT==2.10.1
APScheduler==3.11.0
httpx
```

---

## 决策记录

| 日期 | 问题 | 决策 |
|------|------|------|
| 2026-03-03 | API 提供商（国内可用） | LLM: 阿里通义千问, STT: 阿里云百炼/灵积平台 (paraformer), Embedding: 阿里 text-embedding-v2 |
| 2026-03-03 | 向量数据库选型 | 本地 ChromaDB，保留抽象接口可切换云服务 |
| 2026-03-03 | 测试用户方案 | 单用户简化，硬编码 `test-user-001` |
| 2026-03-03 | 测试用户 Token | 硬编码 `/api/auth/token` 返回固定 Token |
