# SparkFlow — 开发进度跟踪

> 最后更新：2026-03-03

## 总体进度

| 阶段 | 描述 | 状态 | 完成度 |
|------|------|------|--------|
| 阶段 0 | 开发环境搭建 | 🟡 进行中 | 50% |
| 阶段 1 | 核心架构设计 | 🔲 未开始 | 0% |
| 阶段 2 | 数据库模型与迁移 | 🔲 未开始 | 0% |
| 阶段 3 | 碎片笔记 CRUD API | 🔲 未开始 | 0% |
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
- [ ] 0.5 创建 Expo 前端项目
- [ ] 0.6 验证前后端网络连通性
- [ ] 0.7 安装前端核心 Expo 模块
- [ ] 0.8 安装前端 UI 组件库

### 阶段 1：核心架构设计

- [ ] 1.1 设计统一服务接口层 (base_llm, base_stt, base_vector_db)
- [ ] 1.2 设计 API 统一响应规范
- [ ] 1.3 设计 API 鉴权机制 (JWT)

### 阶段 2：数据库模型与迁移

- [ ] 2.1 配置环境变量 (.env)
- [ ] 2.2 实现全局错误处理机制
- [ ] 2.3 定义 SQLAlchemy 数据库连接
- [ ] 2.4 定义 Users 数据模型
- [ ] 2.5 定义 Fragments 数据模型
- [ ] 2.6 定义 Scripts 数据模型
- [ ] 2.7 定义 KnowledgeDocs 数据模型
- [ ] 2.8 定义 Agents 预留数据模型
- [ ] 2.9 初始化 Alembic 迁移系统
- [ ] 2.10 创建默认测试用户种子数据

### 阶段 3：碎片笔记 CRUD API

- [ ] 3.1 创建 Fragments 路由文件并注册
- [ ] 3.2 实现创建碎片笔记 POST 端点
- [ ] 3.3 实现获取碎片列表 GET 端点
- [ ] 3.4 实现获取单条碎片详情 GET 端点
- [ ] 3.5 实现删除碎片 DELETE 端点

### 阶段 4：前端碎片库列表页

- [ ] 4.1 配置前端路由结构 (Tabs)
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
- [ ] 6.2 实现 STT 服务封装 (阿里云 NLS)
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
| 2026-03-03 | API 提供商（国内可用） | LLM: 阿里通义千问, STT: 阿里云 NLS, Embedding: 阿里 text-embedding-v2 |
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
4. ✅ ~~执行阶段 0.4：搭建后端目录结构~~ **已完成（等待用户测试）**

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
