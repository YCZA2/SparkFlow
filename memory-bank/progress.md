# SparkFlow — 开发进度跟踪

> 最后更新：2026-03-03

---

## 阶段 1.1 验证清单

### 1.1 统一服务接口层验证

```bash
# 验证抽象基类
python -c "from services.base import BaseLLMService, BaseSTTService, BaseEmbeddingService, BaseVectorDBService; print('✓ 所有抽象基类加载成功')"

# 验证具体实现类
python -c "
from services.qwen_llm import QwenLLMService
from services.dashscope_stt import DashScopeSTTService
from services.qwen_embedding import QwenEmbeddingService
from services.chroma_vector_db import ChromaVectorDBService
print('✓ 所有服务实现类加载成功')
"

# 验证服务工厂
python -c "
from services import (
    create_llm_service, create_stt_service,
    create_embedding_service, create_vector_db_service,
    get_llm_service, get_stt_service
)
print('✓ 服务工厂函数加载成功')
"

# 验证配置模块
python -c "
from core import settings, success_response, error_response, AppException
print(f'✓ 配置加载成功: APP_NAME={settings.APP_NAME}')
print(f'✓ 默认LLM Provider: {settings.LLM_PROVIDER}')
print(f'✓ 默认STT Provider: {settings.STT_PROVIDER}')
"

# 启动服务器并测试健康检查
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend
source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 在另一个终端测试
curl http://localhost:8000/health
# 预期输出包含: {"success": true, "data": {"version": "0.1.0", "services": {...}}}
```

### 阶段 1.1 已完成内容

**抽象基类层 (backend/services/base/)**
- ✅ `base_llm.py` - LLM 统一接口，支持 generate() 和 generate_stream()
- ✅ `base_stt.py` - 语音识别统一接口，支持 transcribe() 和 transcribe_bytes()
- ✅ `base_embedding.py` - Embedding 统一接口，支持 embed() 和 embed_batch()
- ✅ `base_vector_db.py` - 向量数据库统一接口，支持 upsert(), query(), delete()
- ✅ 完整的异常层次结构 (LLMError, STTError, EmbeddingError, VectorDBError)

**具体实现层 (backend/services/)**
- ✅ `qwen_llm.py` - 阿里通义千问 LLM 实现
- ✅ `dashscope_stt.py` - 阿里云百炼/灵积平台语音识别实现 (paraformer-v2)
- ✅ `qwen_embedding.py` - 阿里通义千问 Embedding 实现
- ✅ `chroma_vector_db.py` - ChromaDB 本地向量数据库实现

**服务工厂 (backend/services/factory.py)**
- ✅ `create_llm_service()` - 根据配置创建 LLM 服务
- ✅ `create_stt_service()` - 根据配置创建 STT 服务
- ✅ `create_embedding_service()` - 根据配置创建 Embedding 服务
- ✅ `create_vector_db_service()` - 根据配置创建 VectorDB 服务
- ✅ 单例模式 getter 函数 (get_llm_service, get_stt_service, etc.)

**核心基础设施 (backend/core/)**
- ✅ `config.py` - Pydantic Settings 配置管理
- ✅ `response.py` - 统一 API 响应格式
- ✅ `exceptions.py` - 业务异常层次结构

**配置示例**
- ✅ `.env.example` - 环境变量模板

**新增依赖**
```
pydantic-settings==2.8.1
dashscope==1.22.1
alibabacloud-nls==1.0.0
chromadb==0.6.3
PyJWT==2.10.1
APScheduler==3.11.0
httpx
```

## 总体进度

| 阶段 | 描述 | 状态 | 完成度 |
|------|------|------|--------|
| 阶段 0 | 开发环境搭建 | 🟢 已完成 | 100% |
| 阶段 1 | 核心架构设计 | 🟢 已完成 | 100% |
| 阶段 2 | 数据库模型与迁移 | 🟢 已完成 | 100% |
| 阶段 3 | 碎片笔记 CRUD API | 🟢 已完成 | 100% |
| 阶段 4 | 前端碎片库列表页 | 🔲 未开始 | 0% |
| 阶段 5 | 录音功能 | 🔲 未开始 | 0% |
| 阶段 6 | 语音转写集成 (STT) | 🔲 未开始 | 0% |
| 阶段 7 | AI 自动摘要与标签 | 🔲 未开始 | 0% |
| 阶段 8 | AI 口播稿生成 | 🔲 未开始 | 0% |
| 阶段 9 | 提词器功能 | 🔲 未开始 | 0% |
| 阶段 10 | 相机拍摄与保存 | 🔲 未开始 | 0% |
| 阶段 11 | 知识库基础 | 🔲 未开始 | 0% |
| 阶段 12 | 向量数据库集成 | 🔲 未开始 | 0% |
| 阶段 13 | 每日灵感推盘 | 🔲 未开始 | 0% |
| 阶段 14 | 收尾与全流程验证 | 🔲 未开始 | 0% |

---

## 详细任务清单

### 阶段 0：开发环境搭建

- [x] 0.1 安装系统级依赖 (Python 3.12, Node.js, Watchman, Xcode)
- [x] 0.2 创建项目根目录与 Git 仓库
- [x] 0.3 搭建 FastAPI 后端骨架
- [x] 0.4 搭建后端目录结构
- [x] 0.5 创建 Expo 前端项目
- [x] 0.6 验证前后端网络连通性
  - [x] 配置 `mobile/utils/api.ts` 统一 API 请求工具
- [x] 0.7 安装前端核心 Expo 模块
- [x] 0.8 安装前端 UI 组件库

### 阶段 1：核心架构设计

- [x] 1.1 设计统一服务接口层 (base_llm, base_stt, base_vector_db, base_embedding)
  - 抽象基类定义完成
  - 阿里通义千问 LLM 实现完成
  - 阿里云百炼/灵积平台 STT 实现完成 (paraformer-v2)
  - 阿里 Embedding 实现完成
  - ChromaDB 向量数据库实现完成
  - 服务工厂和配置管理完成
- [x] 1.2 设计 API 统一响应规范
  - `core/response.py` 统一响应格式（success_response, error_response）
  - `core/exceptions.py` 业务异常层次结构
  - 全局异常处理器已注册
  - 测试端点验证响应格式正确
- [x] 1.3 设计 API 鉴权机制 (JWT)
  - `core/auth.py` JWT 鉴权模块（create_access_token, get_current_user）
  - `routers/auth.py` 认证路由（/api/auth/token, /api/auth/me）
  - 测试用户硬编码 `test-user-001`
  - 受保护端点测试通过

### 阶段 2：数据库模型与迁移

- [x] 2.1 配置环境变量 (.env) - `.env.example` 已存在
- [x] 2.2 实现全局错误处理机制 - `core/exceptions.py` 已完成
- [x] 2.3 定义 SQLAlchemy 数据库连接 - `models/database.py` 完成
- [x] 2.4 定义 Users 数据模型 - `models/db_models.py` 完成
- [x] 2.5 定义 Fragments 数据模型 - `models/db_models.py` 完成
- [x] 2.6 定义 Scripts 数据模型 - `models/db_models.py` 完成
- [x] 2.7 定义 KnowledgeDocs 数据模型 - `models/db_models.py` 完成
- [x] 2.8 定义 Agents 预留数据模型 - `models/db_models.py` 完成
- [x] 2.9 初始化 Alembic 迁移系统 - 迁移文件已生成并应用
- [x] 2.10 创建默认测试用户种子数据 - `seed.py` 完成

### 阶段 3：碎片笔记 CRUD API

- [x] 3.1 创建 Fragments 路由文件并注册
- [x] 3.2 实现创建碎片笔记 POST 端点
- [x] 3.3 实现获取碎片列表 GET 端点
- [x] 3.4 实现获取单条碎片详情 GET 端点
- [x] 3.5 实现删除碎片 DELETE 端点

#### 阶段 3 验证清单

```bash
# 启动后端服务
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend
source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 1. 获取测试用户 Token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/token -H "Content-Type: application/json" -d '{}' | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
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

# 4. 获取单条碎片详情（替换 <fragment_id> 为实际 ID）
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/fragments/<fragment_id>
# 预期: {"success": true, "data": {"id": "...", "transcript": "...", ...}}

# 5. 删除碎片
curl -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/fragments/<fragment_id>
# 预期: HTTP 204 No Content
```

### 阶段 4：前端碎片库列表页

- [x] 4.1 配置前端路由结构 (Tabs)
- [ ] 4.2 创建 API 请求工具模块
- [ ] 4.3 实现碎片库列表页面
- [ ] 4.4 实现碎片详情页

### 阶段 5：录音功能

- [ ] 5.1 创建首页录音按钮 UI
- [ ] 5.2 实现 expo-av 录音功能
- [ ] 5.3 创建音频上传 API 端点
- [ ] 5.4 前端录音结束后自动上传音频

### 阶段 6：语音转写集成 (STT)

- [ ] 6.1 配置外部 API 密钥管理
- [ ] 6.2 实现 STT 服务封装 (阿里云百炼/灵积平台 paraformer)
- [ ] 6.3 上传后自动转写并创建碎片
- [ ] 6.4 前端录音全流程联调

### 阶段 7：AI 自动摘要与标签

- [ ] 7.1 实现 LLM 服务封装
- [ ] 7.2 实现自动摘要生成函数
- [ ] 7.3 实现自动标签生成函数
- [ ] 7.4 在转写流程中串联摘要和标签
- [ ] 7.5 前端碎片卡片显示摘要和标签

### 阶段 8：AI 口播稿生成

- [ ] 8.1 编写导师爆款模式 Prompt
- [ ] 8.2 编写专属二脑模式 Prompt
- [ ] 8.3 实现口播稿生成 API 端点
- [ ] 8.4 实现口播稿列表 API
- [ ] 8.5 实现口播稿详情 API
- [ ] 8.6 前端碎片多选与"交给 AI 编导"按钮
- [ ] 8.7 前端 AI 生成页面

### 阶段 9：提词器功能

- [ ] 9.1 口播稿详情页添加"一键去拍摄"按钮
- [ ] 9.2 实现提词器文本滚动组件
- [ ] 9.3 提词器滚动速度可调

### 阶段 10：相机拍摄与保存

- [ ] 10.1 实现基础相机预览
- [ ] 10.2 在相机预览上叠加提词器
- [ ] 10.3 实现视频录制功能
- [ ] 10.4 保存视频到系统相册
- [ ] 10.5 实现口播稿状态更新 API

### 阶段 11：知识库基础

- [ ] 11.1 实现知识库文档上传 API
- [ ] 11.2 实现知识库文档列表 API
- [ ] 11.3 实现文件上传解析 (TXT/Word)
- [ ] 11.4 前端知识库管理入口

### 阶段 12：向量数据库集成

- [ ] 12.1 配置 ChromaDB 本地向量数据库
- [ ] 12.2 创建用户专属向量命名空间
- [ ] 12.3 实现向量相似度查询
- [ ] 12.4 知识库文档上传时自动写入向量库
- [ ] 12.5 Mode B 生成时检索知识库 (必须实现)

### 阶段 13：每日灵感推盘

- [ ] 13.1 实现每日聚合逻辑函数
- [ ] 13.2 配置 APScheduler 定时任务
- [ ] 13.3 实现每日推盘 API 查询端点
- [ ] 13.4 前端首页每日灵感卡片

### 阶段 14：收尾与全流程验证

- [ ] 14.1 端到端冒烟测试
- [ ] 14.2 验证数据库预留字段与架构完整性
- [ ] 14.3 验证 API 完整性与安全机制
- [ ] 14.4 清理与文档化 (README)

---

## 已知问题与决策记录

| 日期 | 问题 | 决策 |
|------|------|------|
| 2026-03-03 | 系统依赖版本 | Python 3.12.10, Node.js v24.3.0, Watchman 2025.05.19.00, Xcode CLT ✓ |
| 2026-03-02 | sync_status 默认值 | `'pending'`（离线优先，上传成功后变为 `'synced'`） |
| 2026-03-02 | 向量数据库选型 | 本地 ChromaDB，保留抽象接口可切换云服务 |
| 2026-03-02 | 音频存储路径 | `uploads/{user_id}/{uuid}.m4a` |
| 2026-03-02 | 测试用户方案 | 单用户简化，硬编码 `test-user-001` |
| 2026-03-03 | API 提供商（国内可用） | LLM: 阿里通义千问, STT: 阿里云百炼/灵积平台 (paraformer), Embedding: 阿里 text-embedding-v2 |
| 2026-03-03 | 开发者账号 | Apple ID 个人免费证书，7天重签周期 |
| 2026-03-03 | 音频转码 | **不转码**，直接使用 `.m4a` 格式 |
| 2026-03-03 | 存储配额检查 | MVP **跳过**配额检查 |
| 2026-03-03 | 离线支持 | MVP 仅 **在线-only**，离线同步后续迭代 |
| 2026-03-03 | Mode B 实现 | 分阶段：阶段8简化（无知识库），阶段12增强 |
| 2026-03-03 | 每日推盘关联逻辑 | 数量 ≥3 **且** 语义相似度匹配 |
| 2026-03-03 | 测试用户 Token | 硬编码 `/api/auth/token` 返回固定 Token |

---

## 下一步行动

1. ✅ ~~执行阶段 0.1：安装系统级依赖~~ **已完成**
2. ✅ ~~执行阶段 0.2：创建项目根目录与 Git 仓库~~ **已完成**
3. ✅ ~~执行阶段 0.3：搭建 FastAPI 后端骨架~~ **已完成**
4. ✅ ~~执行阶段 0.4：搭建后端目录结构~~ **已完成**
5. ✅ ~~执行阶段 0.5-0.8：创建 Expo 前端项目并安装依赖~~ **已完成（等待用户测试）**

---

## 阶段 0.5-0.8 验证清单

### 阶段 0.5 验证 - Expo 项目结构

```bash
# 检查 mobile 目录结构
ls /Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile/
# 预期: app/  assets/  components/  constants/  node_modules/  package.json  tsconfig.json 等

# 检查 app 目录（expo-router 文件路由）
ls /Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile/app/
# 预期: (tabs)/  _layout.tsx  +not-found.tsx  +html.tsx  modal.tsx

# 检查 tabs 路由
ls /Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile/app/\(tabs\)/
# 预期: _layout.tsx  index.tsx  two.tsx
```

### 阶段 0.7 验证 - 核心 Expo 模块

```bash
# 检查 package.json 中的依赖
cat /Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile/package.json | grep -E "(expo-av|expo-camera|expo-media-library|expo-file-system|expo-notifications|expo-document-picker|expo-sqlite)"
# 预期: 所有 7 个包都出现在 dependencies 中
```

### 阶段 0.8 验证 - UI 组件库

```bash
# 检查 react-native-paper 安装
cat /Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile/package.json | grep "react-native-paper"
# 预期: 显示 react-native-paper 版本

# 检查 PaperProvider 配置
grep -A 2 "PaperProvider" /Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile/app/_layout.tsx
# 预期: 显示 PaperProvider 导入和包裹根组件
```

### 完整启动测试

```bash
# 1. 启动后端服务（在 backend/ 目录）
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend
source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 2. 启动前端（在 mobile/ 目录，新开终端）
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile
npx expo start --ios

# 预期: iOS 模拟器启动，显示 Expo 欢迎界面（Tabs 模板默认界面）
```

## 阶段 0.1 验证清单

验证以下命令均返回版本号且无报错：

```bash
# Python 3.12
/opt/homebrew/bin/python3.12 --version
# 预期输出: Python 3.12.10

# Node.js
node --version
# 预期输出: v24.3.0 (或更高 LTS 版本)

# Watchman
watchman --version
# 预期输出: 2025.05.19.00 (或更高版本)

# Xcode Command Line Tools
xcode-select -p
# 预期输出: /Library/Developer/CommandLineTools
```

## 阶段 0.2 验证清单

验证项目结构完整：

```bash
# 项目根目录
ls /Users/hujiahui/Desktop/VibeCoding/SparkFlow
# 预期: backend/  mobile/  memory-bank/  .git/  .gitignore  CLAUDE.md

# Git 状态干净
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow && git status
# 预期: On branch main, nothing to commit, working tree clean
```

## 阶段 0.3 验证清单

验证 FastAPI 后端骨架：

```bash
# 1. 检查虚拟环境存在
ls /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/.venv
# 预期: bin/  include/  lib/  pyvenv.cfg

# 2. 检查依赖安装
ls /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/requirements.txt
# 预期: 文件存在，包含 fastapi, uvicorn 等

# 3. 检查 main.py 存在
cat /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/main.py
# 预期: 包含 FastAPI app 和 GET / 端点

# 4. 启动服务测试（在 backend/ 目录）
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend
source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 5. 在另一个终端测试端点
curl http://localhost:8000
# 预期输出: {"status":"ok"}

curl http://localhost:8000/docs | head -5
# 预期: 包含 <!DOCTYPE html> 和 swagger-ui
```

## 阶段 0.4 验证清单

验证后端目录结构：

```bash
# 检查目录结构
find /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend -maxdepth 3 -type f ! -path "*/.venv/*" | sort

# 预期输出:
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/main.py
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/models/__init__.py
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/models/db_models.py
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/prompts/mode_a_boom.txt
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/prompts/mode_b_brain.txt
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/requirements.txt
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/routers/__init__.py
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/routers/fragments.py
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/routers/knowledge.py
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/routers/scripts.py
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/routers/transcribe.py
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/services/__init__.py
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/services/llm_service.py
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/services/scheduler.py
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/services/stt_service.py
# /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/services/vector_service.py

# 验证无导入错误
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend
source .venv/bin/activate && python -c "from main import app; print('OK')"
# 预期: OK
```

---

## 阶段 1.2 验证清单

### API 统一响应规范验证

```bash
# 启动后端服务
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend
source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 测试成功响应格式
curl http://localhost:8000/test/success
# 预期: {"success": true, "data": {...}, "message": "...", "error": null}

# 测试错误响应格式
curl http://localhost:8000/test/not-found
# 预期: {"success": false, "data": null, "error": {"code": "NOT_FOUND_ERROR", ...}}

# 测试校验错误格式
curl http://localhost:8000/test/validation-error
# 预期: {"success": false, "data": null, "error": {"code": "VALIDATION_ERROR", ...}}
```

### 阶段 1.2 已完成内容

- ✅ `core/response.py` - 统一响应格式（success_response, error_response, ResponseModel）
- ✅ `core/exceptions.py` - 业务异常层次结构（AppException, NotFoundError, ValidationError, AuthenticationError）
- ✅ 全局异常处理器 - 在 main.py 中注册，统一处理所有异常
- ✅ 测试端点 - `/test/success`, `/test/not-found`, `/test/validation-error`

---

## 阶段 1.3 验证清单

### JWT 鉴权机制验证

```bash
# 启动后端服务
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend
source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 1. 获取测试用户 Token
curl -X POST http://localhost:8000/api/auth/token -H "Content-Type: application/json" -d '{}'
# 预期: {"success": true, "data": {"access_token": "eyJ...", "token_type": "bearer"}}

# 2. 不带 Token 访问受保护端点（应返回 401）
curl http://localhost:8000/test/protected
# 预期: HTTP 401, {"success": false, "error": {"code": "AUTHENTICATION_ERROR", ...}}

# 3. 带 Token 访问受保护端点（应成功）
curl -H "Authorization: Bearer <token>" http://localhost:8000/test/protected
# 预期: {"success": true, "data": {"message": "You have accessed a protected resource", ...}}

# 4. 获取当前用户信息
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/auth/me
# 预期: {"success": true, "data": {"user_id": "test-user-001", "role": "user"}}

# 5. 刷新 Token
curl -X POST -H "Authorization: Bearer <token>" http://localhost:8000/api/auth/refresh
# 预期: {"success": true, "data": {"access_token": "eyJ...", "token_type": "bearer"}}
```

### 阶段 1.3 已完成内容

**JWT 鉴权模块 (backend/core/auth.py)**
- ✅ `create_access_token(user_id, role)` - 创建 JWT Token
- ✅ `decode_token(token)` - 解码并验证 Token
- ✅ `get_current_user(token)` - 依赖注入获取当前用户
- ✅ `get_optional_user(token)` - 可选认证（用于公开端点）
- ✅ `TokenResponse` - Token 响应结构

**认证路由 (backend/routers/auth.py)**
- ✅ `POST /api/auth/token` - 获取测试用户 Token
- ✅ `GET /api/auth/me` - 获取当前用户信息（需认证）
- ✅ `POST /api/auth/refresh` - 刷新 Token（需认证）

**配置更新**
- ✅ `SECRET_KEY` - JWT 签名密钥
- ✅ `ACCESS_TOKEN_EXPIRE_MINUTES` - Token 过期时间（默认 24 小时）

**测试端点**
- ✅ `GET /test/protected` - 受保护端点测试
- ✅ `GET /test/auth-check` - 认证检查端点

---

## 阶段 2 验证清单

### 2.1 验证环境变量配置

```bash
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend
source .venv/bin/activate

# 验证配置加载
python -c "from core import settings; print(f'DATABASE_URL: {settings.DATABASE_URL}'); print(f'APP_NAME: {settings.APP_NAME}')"
# 预期: DATABASE_URL: sqlite:///./data.db
```

### 2.2 验证全局错误处理

```bash
# 启动后端服务
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# 测试成功响应
curl http://localhost:8000/test/success
# 预期: {"success": true, "data": {...}}

# 测试错误响应
curl http://localhost:8000/test/not-found
# 预期: {"success": false, "error": {"code": "NOT_FOUND_ERROR"}}

# 测试校验错误
curl http://localhost:8000/test/validation-error
# 预期: {"success": false, "error": {"code": "VALIDATION_ERROR"}}
```

### 2.3-2.8 验证数据模型

```bash
# 验证模型导入
python -c "
from models import User, Fragment, Script, KnowledgeDoc, Agent, Base
print('✓ 所有模型导入成功')
print(f'✓ 表名: {Base.metadata.tables.keys()}')
"

# 预期输出包含:
# ✓ 所有模型导入成功
# ✓ 表名: dict_keys(['users', 'fragments', 'scripts', 'knowledge_docs', 'agents'])
```

### 2.9 验证 Alembic 迁移

```bash
# 检查当前迁移版本
alembic current
# 预期: e6b527a83de7 (head)

# 查看迁移历史
alembic history --verbose
# 预期: 显示 initial tables 迁移

# 验证迁移文件存在
ls /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/alembic/versions/
# 预期: e6b527a83de7_initial_tables.py
```

### 2.10 验证种子数据

```bash
# 运行种子脚本（可重复执行，不会重复插入）
python seed.py
# 预期:
# ✓ 测试用户已存在: test-user-001 (测试博主)
# 或
# ✓ 测试用户创建成功: test-user-001 (测试博主)

# 验证数据库内容
python -c "
import sqlite3
conn = sqlite3.connect('data.db')
cursor = conn.cursor()
cursor.execute('SELECT id, nickname, role FROM users;')
user = cursor.fetchone()
print(f'用户: {user}')
conn.close()
"
# 预期: 用户: ('test-user-001', '测试博主', 'user')
```

### 完整数据库 Schema 验证

```bash
# 使用 sqlite3 命令行验证
sqlite3 data.db ".schema"

# 预期看到完整的 5 张表结构:
# CREATE TABLE users (...)
# CREATE TABLE fragments (...)
# CREATE TABLE scripts (...)
# CREATE TABLE knowledge_docs (...)
# CREATE TABLE agents (...)
```

---

## 下一步行动

1. ✅ ~~执行阶段 0：开发环境搭建~~ **已完成**
2. ✅ ~~执行阶段 1：核心架构设计~~ **已完成**
3. ✅ ~~执行阶段 2：数据库模型与迁移~~ **已完成**
4. ✅ ~~执行阶段 3：碎片笔记 CRUD API~~ **已完成并验证**
5. ⏳ **执行阶段 4：前端碎片库列表页** （用户验证后开始）
