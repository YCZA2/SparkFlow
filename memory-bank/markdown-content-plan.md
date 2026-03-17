# SparkFlow Markdown Content Plan

最后更新：2026-03-10

> 历史方案文档：本文件形成于 `body_markdown` 仍是内容主线的阶段，现已过期。
> 当前实现已经收敛为 `fragments.body_html` / `scripts.body_html` 与本地 local-first 内容层；只有 `knowledge` 仍继续使用 `body_markdown`。
> 当前真实状态请以 [`architecture.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/memory-bank/architecture.md)、[`mobile/README.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/mobile/README.md) 和 [`backend/README.md`](/Users/hujiahui/Desktop/VibeCoding/SparkFlow/backend/README.md) 为准。

## 当前已落地

- 数据库继续作为事实源。
- `fragments` 已移除 `capture_text`，正文对外统一收敛到 `body_markdown`。
- `scripts`、`knowledge_docs` 新增 `body_markdown`。
- 新增统一 `media_assets` / `content_media_links`，用于图片、录音和通用素材引用。
- 新增 Markdown 导出接口，支持单条 `.md` 和批量 zip。

## 当前约束

- `.md` 文件只在导出时生成，不做持续镜像。
- 外部直接编辑 `.md` 后回写系统仍不支持。
- 移动端正文编辑真值目前仍是单字段 `body_markdown`，本期优先保障**缓存优先编辑会话**与远端最终收敛。
- `knowledge` 和 `scripts` 先保持单正文模型，后续如需富媒体编排再演进到 block 模型。

## 下一步建议

1. 在**缓存优先**文本链路稳定后，再评估碎片详情页是否继续演进成完整 block 编辑器。
2. 为 `media_assets` 增加图片尺寸、音频时长等元信息提取。
3. 将知识库页面从占位入口升级为 Markdown + 素材管理页。
4. 评估脚本页是否也升级到 block 编辑器容器。
