from __future__ import annotations

import re

from modules.shared.content.content_markdown import extract_plain_text
from modules.shared.content.editor_document import render_document_as_markdown

ASSET_REF_PATTERN = re.compile(r"!\[[^\]]*\]\(asset://([^)]+)\)")


def normalize_fragment_body_markdown(markdown: str | None) -> str:
    """规整碎片 Markdown 正文，统一换行并去掉首尾空白。"""
    return str(markdown or "").replace("\r\n", "\n").strip()


def extract_plain_text_from_body_markdown(markdown: str | None) -> str:
    """从碎片 Markdown 正文提取纯文本快照。"""
    return extract_plain_text(normalize_fragment_body_markdown(markdown))


def collect_asset_ids_from_body_markdown(markdown: str | None) -> list[str]:
    """从 Markdown 正文中收集 asset:// 图片引用。"""
    asset_ids: list[str] = []
    for match in ASSET_REF_PATTERN.finditer(normalize_fragment_body_markdown(markdown)):
        asset_id = str(match.group(1) or "").strip()
        if asset_id and asset_id not in asset_ids:
            asset_ids.append(asset_id)
    return asset_ids


def convert_editor_document_to_body_markdown(editor_document: dict | None) -> str:
    """把旧富文本 JSON 一次性转换为 Markdown，供迁移或兜底脚本复用。"""
    return render_document_as_markdown(editor_document).strip()
