"""受控正文内容服务测试。"""

from modules.shared.content.body_service import (
    collect_asset_ids_from_html,
    convert_html_to_markdown,
    convert_markdown_to_basic_html,
    extract_plain_text_from_html,
)


def test_extract_plain_text_from_html_handles_blocks_links_and_images() -> None:
    """纯文本提取应忽略图片占位并压平块级结构。"""
    html = """
    <h1>标题</h1>
    <p>第一段 <a href="https://example.com">链接</a></p>
    <blockquote><p>引用<br />第二行</p></blockquote>
    <p><img src="asset://asset-1" alt="图" /></p>
    """

    assert extract_plain_text_from_html(html) == "标题 第一段 链接 引用 第二行"


def test_collect_asset_ids_from_html_keeps_order_and_deduplicates() -> None:
    """asset:// 图片引用应按出现顺序去重收集。"""
    html = """
    <p><img src="asset://asset-1" alt="封面" /></p>
    <p><img src="https://example.com/image.png" alt="远端图" /></p>
    <p><img src="asset://asset-2" alt="插图" /><img src="asset://asset-1" alt="重复" /></p>
    """

    assert collect_asset_ids_from_html(html) == ["asset-1", "asset-2"]


def test_convert_html_to_markdown_keeps_supported_blocks() -> None:
    """HTML 导出 Markdown 时应稳定保留产品支持的结构。"""
    html = """
    <section><h1>标题</h1></section>
    <p><strong>重点</strong><em>强调</em></p>
    <ul><li>列表一</li><li>列表二</li></ul>
    <blockquote><p>引用<br />第二行</p></blockquote>
    <p><img src="asset://asset-1" alt="插图" /></p>
    """

    assert convert_html_to_markdown(html) == "\n".join(
        [
            "# 标题",
            "",
            "**重点***强调*",
            "",
            "- 列表一",
            "- 列表二",
            "",
            "> 引用",
            "> 第二行",
            "",
            "![插图](asset://asset-1)",
        ]
    )


def test_convert_markdown_to_basic_html_sanitizes_unsupported_markup() -> None:
    """Markdown 转 HTML 后只应保留受控标签白名单。"""
    markdown = "\n".join(
        [
            "# 标题",
            "",
            "> 引用",
            "",
            "- 列表一",
            "- 列表二",
            "",
            "[链接](https://example.com)",
            "",
            "![插图](asset://asset-1)",
            "",
            "<script>alert(1)</script>",
        ]
    )

    assert convert_markdown_to_basic_html(markdown) == (
        "<h1>标题</h1>"
        "<blockquote><p>引用</p></blockquote>"
        "<ul><li>列表一</li><li>列表二</li></ul>"
        "<p><a href=\"https://example.com\">链接</a></p>"
        "<p><img src=\"asset://asset-1\" alt=\"插图\" /></p>"
        "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"
    )
