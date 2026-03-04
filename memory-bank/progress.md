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
| 阶段 7 | AI 自动摘要与标签 | 待开始 | 0% | [查看详情](progress-phase-6-7.md) |
| 阶段 8-10 | 口播稿生成、提词器与拍摄 | 待开始 | 0% | [查看详情](progress-phase-8-10.md) |
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

- **阶段 7**: AI 自动摘要与标签生成
  - 7.2 实现自动摘要生成函数
  - 7.3 实现自动标签生成函数
  - 7.4 在转写流程中串联摘要和标签

### 最近完成

- **阶段 6.3**: 前端录音全流程联调 ✅
  - 修复 DashScope STT 语音识别功能
  - 实现音频上传后自动转写
  - 验证转写结果正确写入数据库
- **阶段 6.2**: 上传后自动转写并创建碎片 ✅
  - 实现 `transcribe_with_retry()` 后台任务
  - 使用 `asyncio.create_task()` 实现异步转写
  - 添加指数退避重试机制（1秒、3秒）
- **阶段 6.1**: 配置外部 API 密钥管理 ✅

### 下一步（待开始）

1. **实现阶段 7.2-7.3: AI 摘要与标签**
   - 在 `services/llm_service.py` 中实现 `generate_summary()`
   - 在 `services/llm_service.py` 中实现 `generate_tags()`
   - 更新 `transcribe.py` 在转写完成后调用摘要和标签生成
2. **阶段 7.5: 前端显示摘要和标签**
   - 更新 `FragmentCard` 组件显示摘要和标签

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
