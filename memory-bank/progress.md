# SparkFlow Progress

> 最后更新：2026-04-01
> 本文件整合历史进度记录，作为当前唯一的进度总览。更细的实现细节请以 [`architecture.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/architecture.md)、[`PRD.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/PRD.md)、[`backend/README.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/README.md) 和 [`mobile/README.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile/README.md) 为准。

## 当前结论

- SparkFlow 已从 `body_markdown` 主线迁移到 `body_html` + local-first 真值。
- 移动端当前是登录后工作区，真正的内容真值在本地 SQLite + 文件系统，后端负责账号、任务、知识库和备份恢复。
- 核心闭环已形成：灵感采集 -> 本地编辑 -> AI 生成 -> 提词拍摄。
- 知识库后端已完成，移动端仍以占位入口为主。
- 每日推盘后端已完成，前端消费尚未完全收口。
- 全链路验证与文档收口仍在继续。

## 已完成

| 领域 | 状态 | 说明 |
|---|---|---|
| 登录与会话 | 已完成 | 邮箱密码登录、会话恢复、单设备在线 |
| 灵感采集 | 已完成 | 语音上传、文本碎片、抖音链接导入、底部 `+` 导入抽屉 |
| 本地正文 | 已完成 | fragment / script 统一 `body_html` 真值，backup queue 负责同步 |
| 脚本生成 | 已完成 | `topic + SOP + 三层写作上下文`，返回 `pipeline_run_id` 轮询 |
| 提词拍摄 | 基本完成 | 拍摄、提词、保存系统相册 |
| 知识库后端 | 已完成 | 创建、上传、搜索、详情、删除，支持 `txt/docx/pdf/xlsx` |
| 向量与检索 | 已完成 | 相似检索、灵感云图、知识库 chunk 召回聚合 |
| 后台任务 | 已完成 | `pipeline_runs` / `pipeline_step_runs` 为唯一任务事实源 |
| 每日推盘后端 | 已完成 | scheduler + API + pipeline 已落地 |
| 备份与恢复 | 已完成 | `/api/backups/*`、显式恢复、素材访问刷新 |
| 文档体系 | 已完成 | 当前实现口径已收束到 `PRD.md` / `architecture.md` / README |

## 进行中

- 知识库移动端完整管理 UI 仍未成型。
- 每日推盘首页消费逻辑尚未完全接入主页面。
- 真机端到端冒烟验证仍需继续补齐。
- 阶段 14 的最终文档与验证收口仍在推进。

## 历史回顾

- 内容层已经从 `body_markdown` 主线演进到 `fragments.body_html` / `scripts.body_html` + local-first 真值。
- 阶段 11：知识库后端能力完成，移动端入口仍占位。
- 阶段 12：向量数据库与三层写作上下文增强完成。
- 阶段 13：每日灵感推盘后端完成，前端消费未完全收口。
- 阶段 14：自动化验证与文档收口仍在继续。
