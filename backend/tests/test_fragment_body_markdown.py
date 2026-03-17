"""碎片 Markdown 正文工具测试。"""

from __future__ import annotations

from modules.shared.content.fragment_body_markdown import (
    collect_asset_ids_from_body_markdown,
    convert_editor_document_to_body_markdown,
    extract_plain_text_from_body_markdown,
)


def test_convert_editor_document_to_body_markdown_renders_supported_blocks() -> None:
    """旧富文本 JSON 应可迁移为可读 Markdown。"""
    markdown = convert_editor_document_to_body_markdown(
        {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "attrs": {"level": 1},
                    "content": [{"type": "text", "text": "标题"}],
                },
                {
                    "type": "paragraph",
                    "content": [
                        {"type": "text", "text": "加粗", "marks": [{"type": "bold"}]},
                        {"type": "text", "text": "和斜体", "marks": [{"type": "italic"}]},
                    ],
                },
            ],
        }
    )

    assert markdown == "# 标题\n\n**加粗***和斜体*"


def test_collect_asset_ids_from_body_markdown_keeps_unique_asset_refs() -> None:
    """正文中的 asset:// 图片引用应按顺序去重收集。"""
    markdown = "\n".join(
        [
            "![封面](asset://asset-1)",
            "",
            "正文",
            "",
            "![插图](asset://asset-2)",
            "![重复](asset://asset-1)",
        ]
    )

    assert collect_asset_ids_from_body_markdown(markdown) == ["asset-1", "asset-2"]


def test_extract_plain_text_from_body_markdown_strips_markdown_syntax() -> None:
    """纯文本快照提取应忽略样式语法和图片占位。"""
    markdown = "# 标题\n\n> 引用内容\n\n- 列表一\n- 列表二\n\n![图](asset://asset-1)"

    assert extract_plain_text_from_body_markdown(markdown) == "标题 引用内容 列表一 列表二"
