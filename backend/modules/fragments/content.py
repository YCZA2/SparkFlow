from __future__ import annotations

from models import Fragment
from modules.shared.content_html import (
    convert_html_to_markdown,
    extract_plain_text_from_html,
    normalize_body_html,
)


def read_fragment_body_html(fragment: Fragment) -> str:
    """统一读取并规整碎片当前 HTML 正文。"""
    return normalize_body_html(getattr(fragment, "body_html", getattr(fragment, "body_markdown", "")))


def read_fragment_plain_text(fragment: Fragment) -> str:
    """优先读取正文快照，缺失时再从正文或转写即时提取。"""
    snapshot = (fragment.plain_text_snapshot or "").strip()
    if snapshot:
        return snapshot
    body_text = extract_plain_text_from_html(read_fragment_body_html(fragment))
    if body_text:
        return body_text
    return str(fragment.transcript or "").strip()


def render_fragment_markdown(fragment: Fragment) -> str:
    """返回碎片正文 Markdown，供导出和外部消费复用。"""
    return convert_html_to_markdown(read_fragment_body_html(fragment))


def resolve_fragment_content_state(fragment: Fragment) -> str:
    """根据正文快照和转写情况返回稳定内容状态。"""
    if extract_plain_text_from_html(read_fragment_body_html(fragment)):
        return "body_present"
    if (fragment.transcript or "").strip():
        return "transcript_only"
    return "empty"
