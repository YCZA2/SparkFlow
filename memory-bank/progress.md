# SparkFlow — 开发进度跟踪

> 最后更新：2026-03-10

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
- `mode_a` / `mode_b` 已统一切到 Dify 工作流生成链路。
- 知识库是“后端能力已完成、移动端工作流未成型”。
- 每日推盘是“后端链路已完成并已切到 Dify 异步 workflow、首页消费未收口”。
- 创作者广场、跨应用悬浮提词、完整竞品解析工具箱不属于当前版本已交付范围。

## 当前已完成的核心能力

- 测试用户登录、token 恢复、后端地址配置。
- 音频上传、后台异步转写、摘要/标签回写、speaker segments 持久化。
- `pipeline_runs` / `pipeline_step_runs` 持久化后台任务队列与自动重试。
- 文本碎片创建与外部媒体音频导入。
- `fragments.transcript`、`fragment_blocks` 与 Markdown 内容编译链路。
- 碎片列表、详情、删除、文件夹归类与批量移动。
- 碎片语义相似检索。
- 碎片向量可视化（灵感云图）。
- `mode_a` / `mode_b` 脚本生成、脚本列表、详情、状态更新、删除。
- `scripts.body_markdown` / `knowledge_docs.body_markdown` 统一正文存储。
- Dify 统一脚本生成 / 每日推盘工作流创建、状态查询与脚本回流。
- 媒体导入、脚本生成和每日推盘统一任务态 API、步骤查询与手动重跑。
- 统一 `media_assets` 资源层与单条 / 批量 Markdown 导出。
- 提词拍摄与视频保存到系统相册的最小闭环。
- 知识库文档创建、上传、列表、搜索、详情、删除。
- 每日推盘异步 pipeline、API 和 APScheduler 定时任务。

## 当前未完成或半完成部分

- 知识库移动端仍是占位页，不是完整管理界面。
- 碎片详情页已支持单正文 Markdown 自动保存编辑，但还不是完整块式编辑器。
- 知识库和脚本也还没有完整的 Markdown 编辑 UI。
- 图片 / 音频 block 类型还没开放，当前 `fragment_blocks` 只支持 Markdown。
- 每日推盘能力在后端已可运行，但当前主首页没有稳定展示“今日灵感卡片”。
- 提词拍摄链路虽然可用，但还不应视为复杂拍摄产品已经完成。
- 全链路手工冒烟与文档归档还没有收口到一个最终版本。
- 移动端还没有完整接入新的任务态 UI 和失败重跑入口。

## 最近一次现状核对结论

本次核对文档时确认了以下事实：

- 后端主业务入口已经收敛到 `backend/modules/*`，旧路由目录已清理，不应再按历史结构写新文档。
- 后端媒体导入与脚本生成已经切到 `pipeline_runs` / `pipeline_step_runs` 作为任务事实源。
- 内容层已经切到“数据库事实源 + Markdown 编辑/导出视图”的方向，而不是本地 `.md` 主存储。
- 后端已新增 `media_assets`、Markdown 导出和 `fragment_blocks`，移动端已完成详情页正文自动保存编辑的最小适配。
- 移动端当前是 stack 路由，不存在实际在用的 `(tabs)` 目录。
- 推荐联调方式已经是仓库根目录执行 `bash scripts/dev-mobile.sh`。
- 本仓库已不再保留 SQLite 兼容分支；后端默认且唯一支持 PostgreSQL。
- 阶段 13 不能再标记为“待开始”，因为 daily push pipeline、调度器和 API 已经在代码中存在。
- PRD 已切换为“当前版本 PRD”，不再把未来规划误写成已交付能力。

## 当前焦点

1. 决定知识库前端是否从占位页升级为真实入口。
2. 把每日推盘卡片接入当前主页面，而不是停留在 hook 层。
3. 补完整体端到端冒烟验证与 Dify 本地部署联调手册。
4. 收口阶段 14 的文档一致性。

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
