# SparkFlow Markdown Content Plan

最后更新：2026-03-10

## 当前已落地

- 数据库继续作为事实源。
- `fragments` 新增 `capture_text`，并通过 `fragment_blocks` 支持块式内容。
- `scripts`、`knowledge_docs` 新增 `body_markdown`。
- 新增统一 `media_assets` / `content_media_links`，用于图片、录音和通用素材引用。
- 新增 Markdown 导出接口，支持单条 `.md` 和批量 zip。

## 当前约束

- `.md` 文件只在导出时生成，不做持续镜像。
- 外部直接编辑 `.md` 后回写系统仍不支持。
- `fragment_blocks` 第一阶段仅支持 `markdown` 类型。
- `knowledge` 和 `scripts` 先保持单正文模型，后续如需富媒体编排再演进到 block 模型。

## 下一步建议

1. 给移动端碎片详情页补真正的 Markdown 编辑与保存。
2. 为 `media_assets` 增加图片尺寸、音频时长等元信息提取。
3. 将知识库页面从占位入口升级为 Markdown + 素材管理页。
4. 评估脚本页是否也升级到 block 编辑器容器。
