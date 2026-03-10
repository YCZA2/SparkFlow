from __future__ import annotations

from models import Fragment
from modules.shared.content_markdown import compile_fragment_markdown, extract_plain_text


def compile_fragment_body_markdown(fragment: Fragment) -> str:
    """统一编译碎片正文 Markdown 内容。"""
    if not fragment.blocks:
        return ""
    return compile_fragment_markdown(
        block_payloads=[block.payload_json for block in sorted(fragment.blocks, key=lambda item: item.order_index)],
    )


def read_fragment_effective_markdown(fragment: Fragment) -> str:
    """按正文优先读取碎片当前生效的 Markdown 文本。"""
    body_markdown = compile_fragment_body_markdown(fragment).strip()
    if body_markdown:
        return body_markdown
    return (fragment.transcript or "").strip()


def read_fragment_effective_text(fragment: Fragment) -> str:
    """按正文优先读取碎片当前生效的纯文本内容。"""
    effective_markdown = read_fragment_effective_markdown(fragment)
    if not effective_markdown:
        return ""
    return extract_plain_text(effective_markdown).strip()


def resolve_fragment_content_state(fragment: Fragment) -> str:
    """根据正文和转写情况返回稳定内容状态。"""
    if compile_fragment_body_markdown(fragment).strip():
        return "body_present"
    if (fragment.transcript or "").strip():
        return "transcript_only"
    return "empty"
