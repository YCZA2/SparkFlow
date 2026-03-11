from __future__ import annotations

from modules.shared.editor_document import (
    apply_ai_patch,
    build_document_from_text,
    collect_asset_ids_from_document,
    convert_legacy_editor_document,
    extract_plain_text_from_document,
    normalize_editor_document,
    render_document_as_markdown,
)


def test_convert_legacy_editor_document_maps_blocks_to_prosemirror() -> None:
    """旧 blocks/children 文档应可转换为 ProseMirror 结构。"""
    legacy = {
        "type": "doc",
        "blocks": [
            {
                "id": "block-1",
                "type": "heading",
                "children": [{"text": "标题", "marks": []}],
            },
            {
                "id": "block-2",
                "type": "paragraph",
                "children": [{"text": "正文", "marks": ["bold"]}],
            },
            {
                "id": "image-1",
                "type": "image",
                "asset_id": "asset-1",
                "url": "https://example.com/a.png",
                "alt": "示意图",
            },
        ],
    }

    document = convert_legacy_editor_document(legacy)

    assert document["type"] == "doc"
    assert document["content"][0]["type"] == "heading"
    assert document["content"][1]["type"] == "paragraph"
    assert document["content"][2]["type"] == "image"
    assert document["content"][2]["attrs"]["assetId"] == "asset-1"


def test_extract_plain_text_and_asset_ids_cover_lists_and_images() -> None:
    """纯文本提取和素材收集应覆盖列表与图片节点。"""
    document = normalize_editor_document(
        {
            "type": "doc",
            "content": [
                {"type": "paragraph", "content": [{"type": "text", "text": "第一段"}]},
                {
                    "type": "bulletList",
                    "content": [
                        {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "清单项"}]}]}
                    ],
                },
                {"type": "image", "attrs": {"src": "https://example.com/img.png", "alt": "配图", "assetId": "asset-2"}},
            ],
        }
    )

    assert extract_plain_text_from_document(document) == "第一段\n清单项\n配图"
    assert collect_asset_ids_from_document(document) == ["asset-2"]


def test_render_document_as_markdown_supports_marks_and_lists() -> None:
    """Markdown 渲染应支持标题、样式、列表和图片。"""
    document = {
        "type": "doc",
        "content": [
            {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "标题"}]},
            {
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "加粗", "marks": [{"type": "bold"}]},
                    {"type": "text", "text": "和"},
                    {"type": "text", "text": "斜体", "marks": [{"type": "italic"}]},
                ],
            },
            {
                "type": "orderedList",
                "content": [
                    {"type": "listItem", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "第一项"}]}]}
                ],
            },
            {"type": "image", "attrs": {"src": "https://example.com/img.png", "alt": "配图"}},
        ],
    }

    markdown = render_document_as_markdown(document)

    assert "# 标题" in markdown
    assert "**加粗**和*斜体*" in markdown
    assert "1. 第一项" in markdown
    assert "![配图](https://example.com/img.png)" in markdown


def test_apply_ai_patch_replaces_range_and_inserts_blocks() -> None:
    """AI patch 应支持文本替换、块插入和标题前置。"""
    document = build_document_from_text("原始内容")

    replaced = apply_ai_patch(
        document,
        {
            "op": "replace_range",
            "range": {"from": 2, "to": 6},
            "text": "新的",
        },
    )
    inserted = apply_ai_patch(
        replaced,
        {
            "op": "insert_block_after_range",
            "range": {"from": 2, "to": 4},
            "blocks": build_document_from_text("第二段")["content"],
        },
    )
    prepended = apply_ai_patch(
        inserted,
        {
            "op": "prepend_heading",
            "block": build_document_from_text("总标题", block_type="heading")["content"][0],
        },
    )

    assert extract_plain_text_from_document(replaced)
    assert prepended["content"][0]["type"] == "heading"
    assert prepended["content"][1]["type"] == "paragraph"
    assert prepended["content"][2]["type"] == "paragraph"
