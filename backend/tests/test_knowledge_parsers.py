"""知识库文件解析的纯单元测试。"""

from __future__ import annotations

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from docx import Document

from core.exceptions import ValidationError
from modules.shared.content.document_parsers import parse_uploaded_text


def _build_docx_bytes(text: str) -> bytes:
    """构造用于测试的 docx 字节流。"""
    document = Document()
    document.add_paragraph(text)
    buffer = BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _build_simple_pdf_bytes(text: str) -> bytes:
    """构造可被 pypdf 提取文本的最小 PDF 字节流。"""
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT\n/F1 12 Tf\n72 72 Td\n({escaped}) Tj\nET\n".encode("latin-1")
    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
        b"4 0 obj\n<< /Length %d >>\nstream\n%s endstream\nendobj\n"
        % (len(stream), stream),
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(pdf))
        pdf.extend(obj)
    startxref = len(pdf)
    pdf.extend(f"xref\n0 {len(offsets)}\n".encode("latin-1"))
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("latin-1"))
    pdf.extend(
        (
            f"trailer\n<< /Root 1 0 R /Size {len(offsets)} >>\n"
            f"startxref\n{startxref}\n%%EOF"
        ).encode("latin-1")
    )
    return bytes(pdf)


def _build_simple_xlsx_bytes(sheet_name: str, rows: list[list[str]]) -> bytes:
    """构造可被 openpyxl 读取的最小 xlsx 字节流。"""
    shared_strings = [value for row in rows for value in row]
    workbook_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
    <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheets>
        <sheet name="{sheet_name}" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
      </sheets>
    </workbook>"""
    shared_strings_xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    ]
    for value in shared_strings:
        shared_strings_xml.append(f"<si><t>{value}</t></si>")
    shared_strings_xml.append("</sst>")
    worksheet_rows = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
    ]
    string_index = 0
    for row_index, row in enumerate(rows, start=1):
        worksheet_rows.append(f'<row r="{row_index}">')
        for col_index, _ in enumerate(row, start=1):
            column = chr(ord("A") + col_index - 1)
            worksheet_rows.append(
                f'<c r="{column}{row_index}" t="s"><v>{string_index}</v></c>'
            )
            string_index += 1
        worksheet_rows.append("</row>")
    worksheet_rows.append("</sheetData></worksheet>")

    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>""",
        )
        archive.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""",
        )
        archive.writestr("xl/workbook.xml", workbook_xml)
        archive.writestr("xl/sharedStrings.xml", "\n".join(shared_strings_xml))
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>""",
        )
        archive.writestr("xl/worksheets/sheet1.xml", "\n".join(worksheet_rows))
    return buffer.getvalue()


def test_parse_uploaded_text_supports_txt_docx_pdf_and_xlsx() -> None:
    """知识库解析器应通过主库解析常见文本型上传格式。"""
    txt = parse_uploaded_text(
        file_content="方法论拆解".encode("utf-8"), filename="sample.txt"
    )
    md = parse_uploaded_text(
        file_content="# 标题\n\n段落内容".encode("utf-8"), filename="sample.md"
    )
    docx = parse_uploaded_text(
        file_content=_build_docx_bytes("语言习惯总结"), filename="sample.docx"
    )
    pdf = parse_uploaded_text(
        file_content=_build_simple_pdf_bytes("hook opener"), filename="sample.pdf"
    )
    xlsx = parse_uploaded_text(
        file_content=_build_simple_xlsx_bytes(
            "Sheet1", [["标题", "钩子"], ["案例", "强对比"]]
        ),
        filename="sample.xlsx",
    )

    assert "方法论拆解" in txt
    assert "标题" in md
    assert "段落内容" in md
    assert "语言习惯总结" in docx
    assert "hook opener" in pdf
    assert "Sheet1" in xlsx
    assert "强对比" in xlsx


def test_parse_uploaded_text_rejects_unknown_or_empty_payloads() -> None:
    """解析器应对未知格式与空内容返回统一校验错误。"""
    with pytest.raises(ValidationError):
        parse_uploaded_text(file_content=b"%PNG", filename="image.png")

    with pytest.raises(ValidationError):
        parse_uploaded_text(file_content=b"   ", filename="empty.txt")


def test_parse_uploaded_text_rejects_invalid_pdf_and_xlsx_payloads() -> None:
    """损坏的 PDF/XLSX 文件应返回稳定的解析错误。"""
    with pytest.raises(ValidationError) as pdf_error:
        parse_uploaded_text(file_content=b"%PDF-broken", filename="broken.pdf")

    assert pdf_error.value.message == "PDF 文件解析失败"
    assert pdf_error.value.details == {"file": "请确认上传的是有效的 .pdf 文件"}

    with pytest.raises(ValidationError) as xlsx_error:
        parse_uploaded_text(file_content=b"not-a-zip", filename="broken.xlsx")

    assert xlsx_error.value.message == "Excel 文件解析失败"
    assert xlsx_error.value.details == {"file": "请确认上传的是有效的 .xlsx 文件"}
