"""受控正文 HTML / Markdown 处理服务。"""

from __future__ import annotations

from html import escape
import re

from bs4 import BeautifulSoup, NavigableString, Tag
from markdownify import markdownify as to_markdown
import mistune


ASSET_PREFIX = "asset://"
ALLOWED_TAGS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "ul", "ol", "li", "br", "strong", "em", "a", "img"}
BLOCK_TAGS = {"p", "blockquote", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6"}
TAG_ALIASES = {
    "article": "p",
    "b": "strong",
    "div": "p",
    "i": "em",
    "section": "p",
}
IGNORED_WRAPPER_TAGS = {"body", "html"}


class ContentBodyService:
    """统一处理受控正文的 HTML / Markdown 转换与解析。"""

    def __init__(self) -> None:
        """初始化受控 Markdown 渲染器。"""
        self._markdown_renderer = mistune.create_markdown(renderer="html", hard_wrap=True)

    def normalize_html(self, html: str | None) -> str:
        """规整正文 HTML，统一换行并去掉首尾空白。"""
        return str(html or "").replace("\r\n", "\n").strip()

    def extract_plain_text(self, html: str | None) -> str:
        """从 HTML 中提取适合检索和摘要的纯文本。"""
        normalized = self.normalize_html(html)
        if not normalized:
            return ""

        soup = self._sanitize_html(normalized)
        self._prepare_plain_text_tree(soup)
        text = soup.get_text(separator="\n")
        return re.sub(r"\s+", " ", text).strip()

    def collect_asset_ids(self, html: str | None) -> list[str]:
        """从 HTML 正文中收集 asset:// 图片引用。"""
        normalized = self.normalize_html(html)
        if not normalized:
            return []

        soup = self._sanitize_html(normalized)
        asset_ids: list[str] = []
        for image in soup.find_all("img"):
            src = str(image.get("src") or "").strip()
            if not src.startswith(ASSET_PREFIX):
                continue
            asset_id = src.removeprefix(ASSET_PREFIX).strip()
            if asset_id and asset_id not in asset_ids:
                asset_ids.append(asset_id)
        return asset_ids

    def html_to_markdown(self, html: str | None) -> str:
        """把受控 HTML 导出为当前产品支持的 Markdown。"""
        normalized = self.normalize_html(html)
        if not normalized:
            return ""

        sanitized_html = self._serialize_soup(self._sanitize_html(normalized))
        markdown = to_markdown(
            sanitized_html,
            heading_style="ATX",
            bullets="-",
            strong_em_symbol="*",
        )
        return self._normalize_markdown(markdown)

    def markdown_to_html(self, markdown: str | None) -> str:
        """把轻量 Markdown 或纯文本转换为基础 HTML。"""
        normalized = self._normalize_markdown(markdown)
        if not normalized:
            return ""

        rendered_html = self._markdown_renderer(normalized)
        sanitized = self._sanitize_html(rendered_html)
        return self._serialize_soup(sanitized)

    def _sanitize_html(self, html: str) -> BeautifulSoup:
        """把正文 HTML 规整到当前产品支持的标签白名单。"""
        soup = BeautifulSoup(html, "html.parser")
        for tag in list(soup.find_all(True)):
            normalized_tag = TAG_ALIASES.get(tag.name.lower(), tag.name.lower())
            tag.name = normalized_tag

            if normalized_tag in IGNORED_WRAPPER_TAGS:
                tag.unwrap()
                continue

            if normalized_tag not in ALLOWED_TAGS:
                tag.unwrap()
                continue

            tag.attrs = self._sanitize_attributes(tag)
        return soup

    def _sanitize_attributes(self, tag: Tag) -> dict[str, str]:
        """过滤标签属性，只保留产品需要的最小字段。"""
        if tag.name == "a":
            href = str(tag.get("href") or "").strip()
            return {"href": href} if href else {}
        if tag.name == "img":
            src = str(tag.get("src") or "").strip()
            if not src:
                return {}
            alt = str(tag.get("alt") or "").strip()
            return {"src": src, **({"alt": alt} if alt else {})}
        return {}

    def _prepare_plain_text_tree(self, soup: BeautifulSoup) -> None:
        """把 HTML 树规整成适合抽取纯文本的结构。"""
        for line_break in list(soup.find_all("br")):
            line_break.replace_with("\n")

        for image in list(soup.find_all("img")):
            image.replace_with(" ")

        for tag in list(soup.find_all(BLOCK_TAGS)):
            tag.insert_before("\n")
            tag.insert_after("\n")

    def _serialize_soup(self, soup: BeautifulSoup) -> str:
        """把规整后的 soup 回写为稳定 HTML 字符串。"""
        parts: list[str] = []
        for child in soup.contents:
            serialized = self._serialize_node(child)
            if serialized:
                parts.append(serialized)
        return self.normalize_html("".join(parts))

    def _serialize_node(self, node: Tag | NavigableString) -> str:
        """递归序列化受控 DOM 节点。"""
        if isinstance(node, NavigableString):
            text = str(node)
            if not text.strip():
                return ""
            return escape(text, quote=False)

        if node.name not in ALLOWED_TAGS:
            return "".join(self._serialize_node(child) for child in node.children)

        attrs = self._serialize_attributes(node)
        if node.name == "br":
            return "<br />"
        if node.name == "img":
            return f"<img{attrs} />"

        children = "".join(self._serialize_node(child) for child in node.children)
        return f"<{node.name}{attrs}>{children}</{node.name}>"

    def _serialize_attributes(self, tag: Tag) -> str:
        """把允许的属性稳定渲染回 HTML。"""
        allowed = self._sanitize_attributes(tag)
        if not allowed:
            return ""
        return "".join(f' {key}="{self._escape_html_attr(value)}"' for key, value in allowed.items())

    def _escape_html_attr(self, value: str) -> str:
        """对 HTML 属性值做最小转义。"""
        return (
            value.replace("&", "&amp;")
            .replace('"', "&quot;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
        )

    def _normalize_markdown(self, markdown: str | None) -> str:
        """规整 Markdown 输出，避免多余空行和尾随空格。"""
        normalized = str(markdown or "").replace("\r\n", "\n").strip()
        if not normalized:
            return ""

        lines = [line.rstrip() for line in normalized.split("\n")]
        compacted: list[str] = []
        blank_count = 0
        for line in lines:
            if line:
                blank_count = 0
                compacted.append(line)
                continue
            blank_count += 1
            if blank_count <= 2:
                compacted.append("")
        return "\n".join(compacted).strip()


content_body_service = ContentBodyService()


def normalize_body_html(html: str | None) -> str:
    """规整正文 HTML，统一换行并去掉首尾空白。"""
    return content_body_service.normalize_html(html)


def extract_plain_text_from_html(html: str | None) -> str:
    """从 HTML 中提取适合摘要、检索和向量化的纯文本。"""
    return content_body_service.extract_plain_text(html)


def collect_asset_ids_from_html(html: str | None) -> list[str]:
    """从 HTML 正文中收集 asset:// 图片引用。"""
    return content_body_service.collect_asset_ids(html)


def convert_html_to_markdown(html: str | None) -> str:
    """把受控 HTML 导出为当前产品支持的 Markdown。"""
    return content_body_service.html_to_markdown(html)


def convert_markdown_to_basic_html(markdown: str | None) -> str:
    """把轻量 Markdown 或纯文本转换为基础 HTML。"""
    return content_body_service.markdown_to_html(markdown)
