"""共享文档解析器，将上传文件提取为纯文本，供知识库和文档导入复用。"""

from __future__ import annotations

import io
import re
import zipfile
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET

from core.exceptions import ValidationError
from core.logging_config import get_logger

logger = get_logger(__name__)


def parse_uploaded_text(*, file_content: bytes, filename: str) -> str:
    """按文件后缀解析上传文本，输出标准化纯文本。"""
    filename_lower = filename.lower()
    if filename_lower.endswith(".txt"):
        return _parse_txt(file_content)
    if filename_lower.endswith(".md"):
        return _parse_md(file_content)
    if filename_lower.endswith(".docx"):
        return _parse_docx(file_content)
    if filename_lower.endswith(".pdf"):
        return _parse_pdf(file_content)
    if filename_lower.endswith(".xlsx"):
        return _parse_xlsx(file_content)
    raise ValidationError(
        message="文件格式不支持",
        field_errors={"file": "仅支持 .txt、.md、.docx、.pdf、.xlsx 格式"},
    )


def _parse_txt(file_content: bytes) -> str:
    """解析 UTF-8 文本文件。"""
    try:
        content = file_content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValidationError(
            message="文件编码错误", field_errors={"file": "文件必须是 UTF-8 编码"}
        ) from exc
    return _ensure_non_empty(content)


def _parse_md(file_content: bytes) -> str:
    """解析 Markdown 文件，保留原始 Markdown 文本供后续 HTML 转换。"""
    try:
        content = file_content.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValidationError(
            message="文件编码错误",
            field_errors={"file": "Markdown 文件必须是 UTF-8 编码"},
        ) from exc
    return _ensure_non_empty(content)


def _parse_docx(file_content: bytes) -> str:
    """解析 Word 文档为段落文本。"""
    try:
        from docx import Document
    except ImportError as exc:
        raise ValidationError(
            message="服务器缺少依赖",
            field_errors={"file": "服务器未安装 python-docx 库"},
        ) from exc
    try:
        document = Document(io.BytesIO(file_content))
    except Exception as exc:
        raise ValidationError(
            message="Word 文件解析失败",
            field_errors={"file": "请确认上传的是有效的 .docx 文件"},
        ) from exc
    content = "\n".join(paragraph.text for paragraph in document.paragraphs)
    return _ensure_non_empty(content)


def _parse_pdf(file_content: bytes) -> str:
    """优先使用 pypdf 解析 PDF，缺失依赖时退回简化文本提取。"""
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(file_content))
        content = "\n".join((page.extract_text() or "") for page in reader.pages)
        if _looks_like_broken_pdf_text(content):
            return _ensure_non_empty(_extract_pdf_text_fallback(file_content))
        return _ensure_non_empty(content)
    except ImportError:
        logger.debug("pypdf_not_installed_falling_back_to_pdf_fallback_parser")
        return _ensure_non_empty(_extract_pdf_text_fallback(file_content))
    except ValidationError:
        raise
    except Exception:
        logger.debug("pdf_primary_parse_failed_falling_back", exc_info=True)
        return _ensure_non_empty(_extract_pdf_text_fallback(file_content))


def _looks_like_broken_pdf_text(content: str) -> bool:
    """识别明显损坏的 PDF 文本结果，避免把乱码当成有效正文。"""
    normalized = str(content or "").strip()
    if not normalized:
        return False
    replacement_count = normalized.count("\ufffd")
    return replacement_count > 0 and replacement_count * 2 >= len(normalized)


def _extract_pdf_text_fallback(file_content: bytes) -> str:
    """为简单文本型 PDF 提供无依赖回退解析，便于本地联调与测试。"""
    decoded = file_content.decode("latin-1", errors="ignore")
    blocks = re.findall(r"BT(.*?)ET", decoded, flags=re.S)
    if not blocks:
        raise ValidationError(
            message="PDF 文件解析失败",
            field_errors={"file": "请确认 PDF 中包含可提取文本"},
        )
    texts: list[str] = []
    for block in blocks:
        for raw in re.findall(r"\((.*?)\)", block, flags=re.S):
            text = raw.replace(r"\(", "(").replace(r"\)", ")").replace(r"\n", "\n")
            cleaned = (
                text.encode("latin-1", errors="ignore")
                .decode("utf-8", errors="ignore")
                .strip()
            )
            if cleaned:
                texts.append(cleaned)
    return "\n".join(texts)


def _parse_xlsx(file_content: bytes) -> str:
    """优先使用 openpyxl 解析 Excel，缺失依赖时退回 XML 读取。"""
    try:
        from openpyxl import load_workbook

        workbook = load_workbook(
            io.BytesIO(file_content), read_only=True, data_only=True
        )
        lines: list[str] = []
        for sheet in workbook.worksheets:
            lines.append(f"[{sheet.title}]")
            for row in sheet.iter_rows(values_only=True):
                values = [
                    str(value).strip() for value in row if value not in (None, "")
                ]
                if values:
                    lines.append("\t".join(values))
        return _ensure_non_empty("\n".join(lines))
    except ImportError:
        logger.debug("openpyxl_not_installed_falling_back_to_xlsx_fallback_parser")
        return _ensure_non_empty(_extract_xlsx_text_fallback(file_content))
    except ValidationError:
        raise
    except Exception:
        logger.debug("xlsx_primary_parse_failed_falling_back", exc_info=True)
        return _ensure_non_empty(_extract_xlsx_text_fallback(file_content))


def _extract_xlsx_text_fallback(file_content: bytes) -> str:
    """在没有 openpyxl 时直接读取 xlsx 压缩包中的 worksheet XML。"""
    try:
        archive = zipfile.ZipFile(io.BytesIO(file_content))
    except Exception as exc:
        raise ValidationError(
            message="Excel 文件解析失败",
            field_errors={"file": "请确认上传的是有效的 .xlsx 文件"},
        ) from exc
    shared_strings = _read_xlsx_shared_strings(archive)
    sheet_names = _read_xlsx_sheet_names(archive)
    worksheet_files = sorted(
        [
            name
            for name in archive.namelist()
            if name.startswith("xl/worksheets/") and name.endswith(".xml")
        ]
    )
    lines: list[str] = []
    for index, worksheet_name in enumerate(worksheet_files, start=1):
        sheet_title = sheet_names.get(index, PurePosixPath(worksheet_name).stem)
        lines.append(f"[{sheet_title}]")
        root = ET.fromstring(archive.read(worksheet_name))
        for row in root.findall(".//{*}row"):
            values: list[str] = []
            for cell in row.findall("{*}c"):
                text = _read_xlsx_cell(cell, shared_strings)
                if text:
                    values.append(text)
            if values:
                lines.append("\t".join(values))
    return "\n".join(lines)


def _read_xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    """读取 Excel 共享字符串表。"""
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values: list[str] = []
    for node in root.findall(".//{*}si"):
        text = "".join(part.text or "" for part in node.findall(".//{*}t")).strip()
        values.append(text)
    return values


def _read_xlsx_sheet_names(archive: zipfile.ZipFile) -> dict[int, str]:
    """读取 workbook 中的 sheet 序号与标题映射。"""
    if "xl/workbook.xml" not in archive.namelist():
        return {}
    root = ET.fromstring(archive.read("xl/workbook.xml"))
    names: dict[int, str] = {}
    for index, sheet in enumerate(root.findall(".//{*}sheet"), start=1):
        names[index] = sheet.attrib.get("name", f"sheet{index}")
    return names


def _read_xlsx_cell(cell: ET.Element, shared_strings: list[str]) -> str:
    """解析 worksheet 单元格文本。"""
    cell_type = cell.attrib.get("t")
    value_node = cell.find("{*}v")
    if cell_type == "inlineStr":
        return "".join(part.text or "" for part in cell.findall(".//{*}t")).strip()
    if value_node is None or value_node.text is None:
        return ""
    raw = value_node.text.strip()
    if cell_type == "s":
        try:
            return shared_strings[int(raw)]
        except (IndexError, KeyError, ValueError):
            return ""
    return raw


def _ensure_non_empty(content: str) -> str:
    """对解析结果做统一非空校验并规范空白。"""
    normalized = content.strip()
    if not normalized:
        raise ValidationError(
            message="文件内容为空", field_errors={"file": "上传的文件没有有效内容"}
        )
    return normalized
