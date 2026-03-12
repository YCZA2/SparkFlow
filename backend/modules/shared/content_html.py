from __future__ import annotations

from dataclasses import dataclass, field
from html import escape, unescape
from html.parser import HTMLParser
import re


ASSET_SRC_PATTERN = re.compile(r"""src=["']asset://([^"']+)["']""", re.IGNORECASE)
BLOCK_TAGS = {"p", "div", "section", "article", "blockquote", "ul", "ol", "li"}
HEADING_TAGS = {"h1", "h2", "h3", "h4", "h5", "h6"}


def normalize_body_html(html: str | None) -> str:
    """规整正文 HTML，统一换行并去掉首尾空白。"""
    return str(html or "").replace("\r\n", "\n").strip()


class _PlainTextHtmlParser(HTMLParser):
    """把受控 HTML 规整为适合检索的纯文本。"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        normalized_tag = tag.lower()
        if normalized_tag in {"br", "p", "div", "blockquote", "li", "ul", "ol", *HEADING_TAGS}:
            self._parts.append("\n")
        if normalized_tag == "img":
            self._parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        normalized_tag = tag.lower()
        if normalized_tag in BLOCK_TAGS or normalized_tag in HEADING_TAGS:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        text = str(data or "")
        if text:
            self._parts.append(text)

    def get_text(self) -> str:
        joined = "".join(self._parts)
        return re.sub(r"\s+", " ", joined).strip()


def extract_plain_text_from_html(html: str | None) -> str:
    """从 HTML 中提取适合摘要、检索和向量化的纯文本。"""
    normalized = normalize_body_html(html)
    if not normalized:
        return ""
    parser = _PlainTextHtmlParser()
    parser.feed(normalized)
    parser.close()
    return parser.get_text()


def collect_asset_ids_from_html(html: str | None) -> list[str]:
    """从 HTML 正文中收集 asset:// 图片引用。"""
    normalized = normalize_body_html(html)
    asset_ids: list[str] = []
    for match in ASSET_SRC_PATTERN.finditer(normalized):
        asset_id = str(match.group(1) or "").strip()
        if asset_id and asset_id not in asset_ids:
            asset_ids.append(asset_id)
    return asset_ids


@dataclass
class _HtmlNode:
    """构造轻量 HTML 树，供 Markdown 导出稳定复用。"""

    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    children: list["_HtmlNode | str"] = field(default_factory=list)


class _HtmlTreeBuilder(HTMLParser):
    """把受控 HTML 解析成轻量树结构。"""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = _HtmlNode("root")
        self._stack: list[_HtmlNode] = [self.root]

    def handle_starttag(self, tag: str, attrs) -> None:
        node = _HtmlNode(tag.lower(), {key: value or "" for key, value in attrs})
        self._stack[-1].children.append(node)
        if tag.lower() != "img":
            self._stack.append(node)

    def handle_endtag(self, tag: str) -> None:
        normalized_tag = tag.lower()
        for index in range(len(self._stack) - 1, 0, -1):
            if self._stack[index].tag == normalized_tag:
                del self._stack[index:]
                break

    def handle_data(self, data: str) -> None:
        text = str(data or "")
        if text:
            self._stack[-1].children.append(text)


def convert_html_to_markdown(html: str | None) -> str:
    """把受控 HTML 导出为当前产品支持的 Markdown。"""
    normalized = normalize_body_html(html)
    if not normalized:
        return ""
    builder = _HtmlTreeBuilder()
    builder.feed(normalized)
    builder.close()
    blocks = [_render_block_markdown(child) for child in builder.root.children]
    return _normalize_markdown_blocks(blocks)


def convert_markdown_to_basic_html(markdown: str | None) -> str:
    """把轻量 Markdown 或纯文本转换为基础 HTML。"""
    normalized = _normalize_markdown(str(markdown or ""))
    if not normalized:
        return ""
    blocks = normalized.split("\n\n")
    html_blocks: list[str] = []
    for block in blocks:
        stripped = block.strip()
        if not stripped:
            continue
        if re.match(r"^#{1,6}\s+", stripped):
            heading_marks = len(stripped) - len(stripped.lstrip("#"))
            text = stripped[heading_marks:].strip()
            level = max(1, min(6, heading_marks))
            html_blocks.append(f"<h{level}>{_render_inline_html(text)}</h{level}>")
            continue
        if stripped.startswith(">"):
            lines = [
                _render_inline_html(re.sub(r"^\s*>\s?", "", line).strip())
                for line in stripped.split("\n")
                if line.strip()
            ]
            html_blocks.append(f"<blockquote><p>{'<br />'.join(lines)}</p></blockquote>")
            continue
        if all(re.match(r"^\s*[-*+]\s+", line) for line in stripped.split("\n")):
            items = [
                f"<li>{_render_inline_html(re.sub(r'^\s*[-*+]\s+', '', line).strip())}</li>"
                for line in stripped.split("\n")
                if line.strip()
            ]
            html_blocks.append(f"<ul>{''.join(items)}</ul>")
            continue
        if all(re.match(r"^\s*\d+\.\s+", line) for line in stripped.split("\n")):
            items = [
                f"<li>{_render_inline_html(re.sub(r'^\s*\d+\.\s+', '', line).strip())}</li>"
                for line in stripped.split("\n")
                if line.strip()
            ]
            html_blocks.append(f"<ol>{''.join(items)}</ol>")
            continue
        html_blocks.append(f"<p>{_render_inline_html(stripped).replace(chr(10), '<br />')}</p>")
    return "".join(html_blocks).strip()


def _render_block_markdown(node: _HtmlNode | str) -> str:
    """按块级节点稳定导出 Markdown 片段。"""
    if isinstance(node, str):
        return _normalize_inline_text(unescape(node))

    if node.tag in {"p", "div", "section", "article"}:
        return _render_inline_markdown(node.children)
    if node.tag in HEADING_TAGS:
        level = max(1, min(6, int(node.tag[-1])))
        return f"{'#' * level} {_render_inline_markdown(node.children)}".strip()
    if node.tag == "blockquote":
        content = _normalize_markdown_blocks(_render_block_markdown(child) for child in node.children)
        return "\n".join(f"> {line}".rstrip() for line in content.split("\n") if line.strip())
    if node.tag == "ul":
        lines = []
        for child in node.children:
            rendered = _render_list_item_markdown(child)
            if rendered:
                lines.append(f"- {rendered}".rstrip())
        return "\n".join(lines)
    if node.tag == "ol":
        lines = []
        order = 1
        for child in node.children:
            rendered = _render_list_item_markdown(child)
            if rendered:
                lines.append(f"{order}. {rendered}".rstrip())
                order += 1
        return "\n".join(lines)
    if node.tag == "img":
        src = node.attrs.get("src", "").strip()
        alt = node.attrs.get("alt", "").strip().replace("]", "\\]")
        if not src:
            return ""
        return f"![{alt}]({src})"
    if node.tag == "br":
        return "\n"
    return _normalize_markdown_blocks(_render_block_markdown(child) for child in node.children)


def _render_list_item_markdown(node: _HtmlNode | str) -> str:
    """把列表项压缩为当前支持的一行 Markdown。"""
    if isinstance(node, str):
        return _normalize_inline_text(unescape(node))
    if node.tag != "li":
        return _render_block_markdown(node)
    parts = [_render_inline_markdown(node.children)]
    return " ".join(part.strip() for part in parts if part and part.strip()).strip()


def _render_inline_markdown(children: list[_HtmlNode | str]) -> str:
    """把 inline 子节点递归导出为轻量 Markdown。"""
    parts: list[str] = []
    for child in children:
        if isinstance(child, str):
            parts.append(_normalize_inline_text(unescape(child)))
            continue
        if child.tag in {"strong", "b"}:
            content = _render_inline_markdown(child.children).strip()
            if content:
                parts.append(f"**{content}**")
            continue
        if child.tag in {"em", "i"}:
            content = _render_inline_markdown(child.children).strip()
            if content:
                parts.append(f"*{content}*")
            continue
        if child.tag == "a":
            content = _render_inline_markdown(child.children).strip() or child.attrs.get("href", "").strip()
            href = child.attrs.get("href", "").strip()
            if href:
                parts.append(f"[{content}]({href})")
            elif content:
                parts.append(content)
            continue
        if child.tag == "img":
            parts.append(_render_block_markdown(child))
            continue
        if child.tag == "br":
            parts.append("\n")
            continue
        parts.append(_render_inline_markdown(child.children))
    return _normalize_inline_markdown("".join(parts))


def _render_inline_html(text: str) -> str:
    """把轻量 Markdown inline 语法转换成基础 HTML。"""
    escaped = escape(text)
    escaped = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", lambda match: f'<img src="{match.group(2)}" alt="{escape(match.group(1))}" />', escaped)
    escaped = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", lambda match: f'<a href="{match.group(2)}">{match.group(1)}</a>', escaped)
    escaped = re.sub(r"\*\*\*([^*]+)\*\*\*", r"<strong><em>\1</em></strong>", escaped)
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", escaped)
    escaped = re.sub(r"\*([^*]+)\*", r"<em>\1</em>", escaped)
    return escaped


def _normalize_markdown(markdown: str) -> str:
    """规整输入 Markdown，减少转换时的噪声。"""
    return markdown.replace("\r\n", "\n").strip()


def _normalize_markdown_blocks(blocks) -> str:
    """统一拼接块内容，避免多余空行。"""
    normalized = [str(block).strip() for block in blocks if str(block).strip()]
    return "\n\n".join(normalized).strip()


def _normalize_inline_text(text: str) -> str:
    """规整 inline 文本，保留必要空格。"""
    return re.sub(r"\s+", " ", text)


def _normalize_inline_markdown(text: str) -> str:
    """清理 inline Markdown 输出中的多余空白。"""
    return re.sub(r"[ \t]+", " ", text).strip()
