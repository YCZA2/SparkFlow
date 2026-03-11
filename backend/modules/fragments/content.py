from __future__ import annotations

from models import Fragment
from modules.shared.editor_document import (
    extract_plain_text_from_document,
    normalize_editor_document,
    render_document_as_markdown,
)


def read_fragment_editor_document(fragment: Fragment) -> dict:
    """统一读取并校验碎片当前正文文档。"""
    return normalize_editor_document(fragment.editor_document)


def read_fragment_plain_text(fragment: Fragment) -> str:
    """优先读取已持久化快照，缺失时再从正文文档即时提取。"""
    snapshot = (fragment.plain_text_snapshot or "").strip()
    if snapshot:
        return snapshot
    return extract_plain_text_from_document(read_fragment_editor_document(fragment))


def render_fragment_markdown(fragment: Fragment) -> str:
    """把碎片正文单向渲染为 Markdown 导出文本。"""
    return render_document_as_markdown(read_fragment_editor_document(fragment))


def resolve_fragment_content_state(fragment: Fragment) -> str:
    """根据正文快照和转写情况返回稳定内容状态。"""
    if read_fragment_plain_text(fragment):
        return "body_present"
    if (fragment.transcript or "").strip():
        return "transcript_only"
    return "empty"
