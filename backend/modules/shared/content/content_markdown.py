from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any


MARKDOWN_BLOCK_TYPE = "markdown"


@dataclass
class MarkdownExportFile:
    """描述单条导出文件的文件名和内容。"""

    filename: str
    content: str


def build_markdown_block_payload(markdown: str) -> str:
    """构造 Markdown 块的稳定 JSON 载荷。"""
    return json.dumps({"markdown": markdown}, ensure_ascii=False)


def parse_markdown_block_payload(payload_json: str) -> str:
    """解析 Markdown 块内容，异常时回退为空字符串。"""
    try:
        payload = json.loads(payload_json)
    except json.JSONDecodeError:
        return ""
    markdown = payload.get("markdown") if isinstance(payload, dict) else ""
    return str(markdown or "")


def compile_fragment_markdown(*, block_payloads: list[str], fallback_text: str | None = None) -> str:
    """将碎片块列表编译为 Markdown 正文。"""
    markdown_parts = [parse_markdown_block_payload(payload).strip() for payload in block_payloads]
    markdown_parts = [item for item in markdown_parts if item]
    if markdown_parts:
        return "\n\n".join(markdown_parts)
    return (fallback_text or "").strip()


def extract_plain_text(markdown: str | None) -> str:
    """从 Markdown 中提取适合检索和向量化的纯文本。"""
    if not markdown:
        return ""
    text = re.sub(r"```[\s\S]*?```", " ", markdown)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"[*_>\-]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def sanitize_export_stem(value: str, *, fallback: str) -> str:
    """清洗导出文件名，避免非法字符破坏 zip 结构。"""
    sanitized = re.sub(r'[\\/:*?"<>|]+', "-", (value or "").strip())
    sanitized = re.sub(r"\s+", " ", sanitized).strip(" .-")
    return sanitized[:80] or fallback


def render_frontmatter(metadata: dict[str, Any]) -> str:
    """将结构化元数据渲染为简化版 YAML frontmatter。"""
    lines: list[str] = ["---"]
    for key, value in metadata.items():
        if value is None:
            continue
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - {str(item).replace(chr(10), ' ')}")
            continue
        normalized = str(value).replace("\n", " ").replace('"', '\\"')
        lines.append(f'{key}: "{normalized}"')
    lines.append("---")
    return "\n".join(lines)


def render_markdown_document(*, metadata: dict[str, Any], body_markdown: str) -> str:
    """拼接可导出的 Markdown 文档内容。"""
    frontmatter = render_frontmatter(metadata=metadata)
    body = body_markdown.strip()
    if not body:
        return f"{frontmatter}\n"
    return f"{frontmatter}\n\n{body}\n"
