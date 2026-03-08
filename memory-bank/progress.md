# SparkFlow — 开发进度跟踪

> 最后更新：2026-03-09

这份文档记录“当前代码仓库的真实状态”。对历史阶段的原始计划，如与现状不一致，应以当前实现、[`PRD.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/PRD.md) 和 [`architecture.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/architecture.md) 为准。

## 总体进度概览

| 阶段 | 描述 | 当前状态 | 进度 |
|------|------|----------|------|
| 阶段 0-1 | 环境搭建与核心架构设计 | 已完成 | 100% |
| 阶段 2-3 | 数据库模型与碎片 CRUD API | 已完成 | 100% |
| 阶段 4-5 | 移动端基础、录音与上传 | 已完成 | 100% |
| 阶段 6-7 | 语音转写、摘要、标签 | 已完成 | 100% |
| 阶段 8-10 | 口播稿生成、提词器、拍摄 | 已完成 | 95% |
| 阶段 11 | 知识库基础 | 后端完成，移动端入口占位 | 85% |
| 阶段 12 | 向量数据库集成 | 主要能力已完成，Mode B 增强未完 | 80% |
| 阶段 13 | 每日灵感推盘 | 后端已落地，前端主入口未完整接入 | 70% |
| 阶段 14 | 收尾与全流程验证 | 部分自动化验证存在，端到端收尾未完成 | 35% |

## 当前版本范围对齐结论

已与当前 PRD 对齐后的产品范围如下：

- 当前版本已经形成“灵感采集 -> AI 生成 -> 提词拍摄”的最小闭环。
- 语音上传、文本碎片、外部媒体音频导入都属于已落地采集能力。
- `mode_a` 是当前稳定主路径，`mode_b` 仍属于部分完成。
- 知识库是“后端能力已完成、移动端工作流未成型”。
- 每日推盘是“后端链路已完成、首页消费未收口”。
- 创作者广场、跨应用悬浮提词、完整竞品解析工具箱不属于当前版本已交付范围。

## 当前已完成的核心能力

- 测试用户登录、token 恢复、后端地址配置。
- 音频上传、后台异步转写、摘要/标签回写、speaker segments 持久化。
- 文本碎片创建与外部媒体音频导入。
- 碎片列表、详情、删除、文件夹归类与批量移动。
- 碎片语义相似检索。
- 碎片向量可视化（灵感云图）。
- `mode_a` 脚本生成、脚本列表、详情、状态更新、删除。
- Dify 脚本研究工作流创建、状态查询与脚本回流。
- 提词拍摄与视频保存到系统相册的最小闭环。
- 知识库文档创建、上传、列表、搜索、详情、删除。
- 每日推盘用例、API 和 APScheduler 定时任务。

## 当前未完成或半完成部分

- `mode_b` 还没有把历史碎片语义检索稳定接入生成链路。
- 知识库移动端仍是占位页，不是完整管理界面。
- 每日推盘能力在后端已可运行，但当前主首页没有稳定展示“今日灵感卡片”。
- 提词拍摄链路虽然可用，但还不应视为复杂拍摄产品已经完成。
- 全链路手工冒烟与文档归档还没有收口到一个最终版本。

## 最近一次现状核对结论

本次核对文档时确认了以下事实：

- 后端主业务入口已经迁移到 `backend/modules/*`，不应再按旧 `backend/routers/*` 结构写新文档。
- 移动端当前是 stack 路由，不存在实际在用的 `(tabs)` 目录。
- 推荐联调方式已经是仓库根目录执行 `bash scripts/dev-mobile.sh`。
- `expo-sqlite` 已安装，但当前移动端主流程的本地持久化仍以 `AsyncStorage` 为主。
- 阶段 13 不能再标记为“待开始”，因为 daily push use case、调度器和 API 已经在代码中存在。
- PRD 已切换为“当前版本 PRD”，不再把未来规划误写成已交付能力。

## 当前焦点

1. 完成 `mode_b` 的历史碎片增强链路。
2. 决定知识库前端是否从占位页升级为真实入口。
3. 把每日推盘卡片接入当前主页面，而不是停留在 hook 层。
4. 收口阶段 14 的冒烟验证与文档一致性。

## 建议启动方式

推荐联调：

```bash
bash scripts/dev-mobile.sh
```

后端单独运行：

```bash
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend
.venv/bin/python -m uvicorn main:app --reload
```

移动端单独运行：

```bash
cd /Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile
npx expo start --lan
```

## 相关文档

- [PRD.md](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/PRD.md)
- [architecture.md](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/architecture.md)
- [frontend-backend-collaboration.md](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/frontend-backend-collaboration.md)
- [tech-stack.md](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/tech-stack.md)
- [progress-phase-11-14.md](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/progress-phase-11-14.md)
