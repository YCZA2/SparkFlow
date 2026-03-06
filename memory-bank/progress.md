# SparkFlow — 开发进度跟踪

> 最后更新：2026-03-05

---

## 总体进度概览

| 阶段 | 描述 | 状态 | 完成度 | 文档链接 |
|------|------|------|--------|----------|
| 阶段 0-1 | 环境搭建与核心架构设计 | 已完成 | 100% | [查看详情](progress-phase-0-1.md) |
| 阶段 2-3 | 数据库模型与碎片笔记 CRUD API | 已完成 | 100% | [查看详情](progress-phase-2-3.md) |
| 阶段 4-5 | 前端基础与录音功能 | 已完成 | 100% | [查看详情](progress-phase-4-5.md) |
| 阶段 6 | 语音转写集成 (STT) | 已完成 | 100% | [查看详情](progress-phase-6-7.md) |
| 阶段 7 | AI 自动摘要与标签 | 已完成 | 100% | [查看详情](progress-phase-6-7.md) |
| 阶段 8-10 | 口播稿生成、提词器与拍摄 | 进行中 | 90% | [查看详情](progress-phase-8-10.md) |
| 阶段 11-14 | 知识库、向量数据库、每日推盘与收尾 | 待开始 | 0% | [查看详情](progress-phase-11-14.md) |

---

## 快速导航

### 按功能模块

| 模块 | 涉及阶段 | 核心功能 |
|------|----------|----------|
| **灵感捕手** | 阶段 4-5 | 首页录音、音频上传 |
| **语音转写** | 阶段 6 | STT 集成、自动转写 |
| **AI 加工** | 阶段 7-8 | 摘要标签、口播稿生成 |
| **提词拍摄** | 阶段 9-10 | 提词器、相机录制 |
| **知识库** | 阶段 11-12 | 文档管理、向量检索 |
| **每日推盘** | 阶段 13 | 定时聚合、自动推送 |

### 关键文档

- [PRD 产品需求文档](PRD.md) - 产品定位与功能规划
- [系统架构文档](architecture.md) - 技术架构与数据库设计
- [技术栈说明](tech-stack.md) - 选型理由与依赖列表
- [实施计划](implementation-plan.md) - 详细开发步骤

---

## 当前焦点

### 正在进行

- **阶段 11**: 知识库基础功能
  - ✅ 11.1 知识库文档上传 API（JSON 方式）
  - ✅ 11.2 知识库文档列表 API
  - ✅ 11.3 文件上传解析（支持 .txt 和 .docx）
  - ⏳ 11.4 前端知识库管理入口（待实施）

### 最近完成

- **阶段 11.1-11.3**: 知识库后端 API ✅（2026-03-05）
  - 实现 `POST /api/knowledge` JSON 方式上传
  - 实现 `POST /api/knowledge/upload` 文件上传方式
  - 支持 .txt 和 .docx 文件解析
  - 实现 `GET /api/knowledge` 列表查询（支持过滤和分页）
  - 实现 `GET /api/knowledge/{doc_id}` 详情查询
  - 实现 `DELETE /api/knowledge/{doc_id}` 删除文档
  - 添加 `python-docx==1.1.2` 到 requirements.txt
  - 在 main.py 中注册 knowledge 路由
  - **架构优化**: 创建 `services/knowledge_service.py` 服务层，遵循路由层与服务层分离原则

- **阶段 10.5**: 口播稿状态更新 API 修复 ✅（2026-03-05）
  - 修复前后端 API 接口不匹配问题
  - 后端改为接受 JSON body 而非 query parameters
  - 新增 `ScriptUpdateRequest` Pydantic 模型
  - 符合 RESTful API 最佳实践
  - 前端 `updateScriptStatus()` 可正常调用

- **后端服务层重构** ✅（2026-03-05）
  - 新增 `fragment_service.py` 封装碎片笔记业务逻辑
  - 简化 `fragments.py` 路由层，遵循单一职责原则
  - 新增 `paginated_data()` 分页辅助函数
  - 优化代码组织，提升可维护性
  - 保持 API 接口兼容性不变

- **阶段 10.4**: 保存视频到系统相册 ✅（2026-03-05）
  - 录制完成后自动请求相册写入权限
  - 使用 `MediaLibrary.createAssetAsync()` 保存视频到系统相册
  - 权限被拒绝时显示提示引导
  - 保存成功后显示 Alert 提示，可选择”继续拍摄”或”返回”
  - 同步更新口播稿状态为 `filmed`

- **阶段 10.3**: 视频录制功能 ✅（2026-03-05）
  - 录制状态管理，开始/停止录制函数
  - 录制按钮 UI（圆形↔方形切换）
  - 录制中状态指示器
  - 录制中禁用切换摄像头和关闭按钮

- **阶段 10.1-10.2**: 相机预览与提词器叠加 ✅（2026-03-05）
  - 使用 `expo-camera` 实现全屏相机预览
  - 请求相机权限（未授权时显示引导页面）
  - 默认前置摄像头，支持镜像
  - 右上角按钮切换前置/后置摄像头
  - 提词器叠加层集成（占屏幕上部 30%）
  - 控制按钮位置调整，避免与顶部按钮重叠

- **阶段 9.3**: 提词器滚动速度可调 ✅（2026-03-05）
  - 添加速度调节控件（S-/S+ 按钮）
  - 支持实时调整滚动速度（0.5x - 3.0x）
  - 速度变化时保持当前位置继续滚动

- **口播稿列表页面** ✅（2026-03-05）
  - 新增 `mobile/app/scripts.tsx` 口播稿列表页面
  - 新增 `mobile/components/ScriptCard.tsx` 口播稿卡片组件
  - 更新 `profile.tsx` 添加”我的口播稿”路由跳转
  - 解决口播稿生成后找不到的问题
  - 修复碎片库选择按钮右边距问题

- **阶段 8**: 口播稿生成功能 ✅
  - ✅ 8.1-8.2 Prompt 设计（导师爆款模式 + 专属二脑模式）
  - ✅ 8.3-8.5 口播稿 API（生成/列表/详情/更新/删除）
  - ✅ 8.6 前端碎片多选与”交给 AI 编导”按钮
  - ✅ 8.7 前端 AI 生成页与生成后跳转详情页

- **阶段 8.3-8.5**: 口播稿 API 实现 ✅
  - `POST /api/scripts/generate`: 根据碎片生成口播稿
  - `GET /api/scripts`: 获取口播稿列表
  - `GET /api/scripts/{id}`: 获取口播稿详情
  - `PATCH /api/scripts/{id}`: 更新口播稿状态/标题
  - `DELETE /api/scripts/{id}`: 删除口播稿
  - 支持 Mode A (导师爆款) 和 Mode B (专属二脑) 两种生成模式

- **阶段 8.1-8.2**: AI 口播稿 Prompt 设计 ✅
  - `mode_a_boom.txt`: 黄金四段式结构（开头钩子→痛点→干货→互动）
  - `mode_b_brain.txt`: 保持用户风格的自然表达模式
  - `FragmentCard.tsx` 优先显示 summary，无摘要时显示 transcript 前50字符
  - 标签以 Chip 样式展示，最多显示3个
  - 详情页完整展示 AI 摘要、标签、转写文本
- **阶段 7.4**: 转写流程串联摘要和标签生成 ✅
  - 修改 `transcribe_with_retry()` 在转写成功后调用 `generate_summary_and_tags()`
  - 并行生成摘要和标签，优化延迟
  - 摘要/标签生成失败不影响转写结果（降级处理）
- **阶段 7.2-7.3**: 摘要和标签生成函数 ✅
  - 实现 `generate_summary()` - 生成20字以内摘要
  - 实现 `generate_tags()` - 生成2-4个中文标签
  - 实现 `generate_summary_and_tags()` - 并行生成优化
- **阶段 6**: 语音转写集成 ✅
  - 修复 DashScope STT 语音识别功能
  - 实现音频上传后自动转写
  - 验证转写结果正确写入数据库

### 下一步（待开始）

1. **验证阶段 10.4-10.5**: 真机测试完整的录制-保存-状态更新流程
   - 启动后端服务
   - 启动前端应用
   - 测试口播稿状态更新 API
   - 测试录制并保存视频到相册
   - 验证口播稿状态自动更新为 `filmed`

2. **阶段 11**: 知识库基础功能

---

## 决策记录汇总

| 日期 | 问题 | 决策 |
|------|------|------|
| 2026-03-03 | API 提供商 | 阿里云百炼/灵积平台 (LLM + STT 共用) |
| 2026-03-03 | 向量数据库 | 本地 ChromaDB |
| 2026-03-03 | 测试用户 | 硬编码 `test-user-001` |
| 2026-03-03 | 音频格式 | 不转码，直接使用 `.m4a` |
| 2026-03-03 | 离线支持 | MVP 仅在线模式 |
| 2026-03-03 | 存储配额 | MVP 跳过配额检查 |
| 2026-03-03 | Mode B 实现 | 分阶段：阶段 8 简化，阶段 12 增强 |

---

## 验证清单速查

### 启动后端

```bash
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend
source .venv/bin/activate && uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 启动前端

```bash
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile
npx expo start --ios
```

### 获取测试 Token

```bash
curl -X POST http://localhost:8000/api/auth/token \
  -H "Content-Type: application/json" -d '{}'
```

---

## 阶段详情

各阶段详细进度请查看对应文件：

- **[阶段 0-1](progress-phase-0-1.md)** - 开发环境搭建、统一服务接口层、API 响应规范、JWT 鉴权
- **[阶段 2-3](progress-phase-2-3.md)** - 数据库模型、Alembic 迁移、Fragments CRUD API
- **[阶段 4-5](progress-phase-4-5.md)** - 前端路由、碎片库列表页、录音功能、音频上传
- **[阶段 6-7](progress-phase-6-7.md)** - 语音转写、AI 摘要与标签生成
- **[阶段 8-10](progress-phase-8-10.md)** - 口播稿生成、提词器、相机拍摄
- **[阶段 11-14](progress-phase-11-14.md)** - 知识库、向量数据库、每日推盘、全流程验证
