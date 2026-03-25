#!/usr/bin/env python3
"""通过真实后端接口联调知识库上传、搜索和脚本生成。"""

from __future__ import annotations

import argparse
import json
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from uuid import uuid4

import httpx


DEFAULT_BACKEND_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_POLL_INTERVAL_SECONDS = 2.0
DEFAULT_POLL_TIMEOUT_SECONDS = 180.0


class KnowledgeGenerationCheckError(RuntimeError):
    """标记知识库真实联调过程中的可读失败。"""


@dataclass
class CreatedResources:
    """记录联调过程中创建的资源，便于按需清理。"""

    knowledge_doc_ids: list[str] = field(default_factory=list)
    fragment_ids: list[str] = field(default_factory=list)
    script_id: str | None = None


def normalize_backend_base_url(raw_value: str) -> str:
    """把后端地址标准化为不带尾斜杠的基址。"""
    value = (raw_value or "").strip().rstrip("/")
    if not value:
        raise KnowledgeGenerationCheckError("缺少后端地址，请传入 --backend-base-url")
    return value


def extract_response_data(payload: dict[str, Any]) -> Any:
    """从标准响应包裹中提取 data 字段。"""
    if not isinstance(payload, dict) or "data" not in payload:
        raise KnowledgeGenerationCheckError(f"后端返回结构无效: {json.dumps(payload, ensure_ascii=False)}")
    return payload["data"]


def request_json(
    client: httpx.Client,
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    json_body: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    files: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """执行一次 HTTP 请求，并把异常统一映射为可读错误。"""
    try:
        response = client.request(method, url, headers=headers, json=json_body, data=data, files=files)
    except httpx.HTTPError as exc:
        raise KnowledgeGenerationCheckError(f"请求失败: {exc}") from exc
    try:
        payload = response.json()
    except ValueError as exc:
        raise KnowledgeGenerationCheckError(f"后端返回了非 JSON 响应: {response.text[:500]}") from exc
    if response.status_code >= 400:
        raise KnowledgeGenerationCheckError(
            f"后端请求失败 {response.status_code}: {json.dumps(payload, ensure_ascii=False)}"
        )
    if not isinstance(payload, dict):
        raise KnowledgeGenerationCheckError("后端返回结构无效")
    return payload


def issue_test_token(client: httpx.Client, *, backend_base_url: str) -> str:
    """向后端申请测试用户 token。"""
    payload = request_json(client, "POST", f"{backend_base_url}/api/auth/token", json_body={})
    data = extract_response_data(payload)
    token = data.get("access_token") if isinstance(data, dict) else None
    if not isinstance(token, str) or not token.strip():
        raise KnowledgeGenerationCheckError(f"签发 token 返回结构异常: {json.dumps(payload, ensure_ascii=False)}")
    return token


def build_auth_headers(token: str) -> dict[str, str]:
    """构造统一的 Bearer 鉴权请求头。"""
    return {"Authorization": f"Bearer {token}"}


def create_fragment(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    body_html: str,
) -> str:
    """通过备份接口写入一条手动测试碎片快照，供真实脚本生成使用。"""
    fragment_id = str(uuid4())
    now = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    payload = request_json(
        client,
        "POST",
        f"{backend_base_url}/api/backups/batch",
        headers=headers,
        json_body={
            "items": [
                {
                    "entity_type": "fragment",
                    "entity_id": fragment_id,
                    "entity_version": 1,
                    "operation": "upsert",
                    "modified_at": now,
                    "payload": {
                        "id": fragment_id,
                        "folder_id": None,
                        "source": "manual",
                        "audio_source": None,
                        "created_at": now,
                        "updated_at": now,
                        "summary": None,
                        "tags": [],
                        "transcript": None,
                        "body_html": body_html,
                        "plain_text_snapshot": body_html.removeprefix("<p>").removesuffix("</p>"),
                        "deleted_at": None,
                    },
                }
            ]
        },
    )
    data = extract_response_data(payload)
    if not isinstance(data, dict) or int(data.get("accepted_count") or 0) != 1:
        raise KnowledgeGenerationCheckError(f"写入碎片快照失败: {json.dumps(payload, ensure_ascii=False)}")
    return fragment_id


def upload_knowledge_doc(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    title: str,
    doc_type: str,
    file_path: Path,
    mime_type: str,
) -> dict[str, Any]:
    """上传单条知识库文档并返回响应数据。"""
    payload = request_json(
        client,
        "POST",
        f"{backend_base_url}/api/knowledge/upload",
        headers=headers,
        data={"title": title, "doc_type": doc_type},
        files={"file": (file_path.name, file_path.read_bytes(), mime_type)},
    )
    data = extract_response_data(payload)
    if not isinstance(data, dict):
        raise KnowledgeGenerationCheckError(f"知识库上传返回结构异常: {json.dumps(payload, ensure_ascii=False)}")
    doc_id = data.get("id")
    if not isinstance(doc_id, str) or not doc_id.strip():
        raise KnowledgeGenerationCheckError(f"知识库上传返回缺少 id: {json.dumps(payload, ensure_ascii=False)}")
    return data


def fetch_knowledge_doc(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    doc_id: str,
) -> dict[str, Any]:
    """读取知识库文档详情。"""
    payload = request_json(client, "GET", f"{backend_base_url}/api/knowledge/{doc_id}", headers=headers)
    data = extract_response_data(payload)
    if not isinstance(data, dict):
        raise KnowledgeGenerationCheckError(f"知识库详情返回结构异常: {json.dumps(payload, ensure_ascii=False)}")
    return data


def wait_for_reference_script_ready(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    doc_id: str,
    poll_interval_seconds: float,
    poll_timeout_seconds: float,
) -> dict[str, Any]:
    """轮询 reference_script 文档，直到进入 ready 或 failed。"""
    deadline = time.monotonic() + poll_timeout_seconds
    while time.monotonic() < deadline:
        doc = fetch_knowledge_doc(client, backend_base_url=backend_base_url, headers=headers, doc_id=doc_id)
        status = str(doc.get("processing_status") or "")
        if status in {"ready", "failed"}:
            return doc
        time.sleep(poll_interval_seconds)
    raise KnowledgeGenerationCheckError(f"reference_script 处理超时: doc_id={doc_id}")


def search_knowledge_docs(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    query_text: str,
    top_k: int,
) -> dict[str, Any]:
    """执行一次知识库搜索并返回聚合结果。"""
    payload = request_json(
        client,
        "POST",
        f"{backend_base_url}/api/knowledge/search",
        headers=headers,
        json_body={"query_text": query_text, "top_k": top_k},
    )
    data = extract_response_data(payload)
    if not isinstance(data, dict):
        raise KnowledgeGenerationCheckError(f"知识库搜索返回结构异常: {json.dumps(payload, ensure_ascii=False)}")
    return data


def trigger_generation(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    topic: str,
    fragment_ids: list[str],
) -> str:
    """发起一次真实脚本生成任务，并返回 pipeline_run_id。"""
    payload = request_json(
        client,
        "POST",
        f"{backend_base_url}/api/scripts/generation",
        headers=headers,
        json_body={"topic": topic, "fragment_ids": fragment_ids},
    )
    data = extract_response_data(payload)
    run_id = data.get("pipeline_run_id") if isinstance(data, dict) else None
    if not isinstance(run_id, str) or not run_id.strip():
        raise KnowledgeGenerationCheckError(f"生成任务返回缺少 pipeline_run_id: {json.dumps(payload, ensure_ascii=False)}")
    return run_id


def is_terminal_status(status: str) -> bool:
    """判断流水线是否已经进入终态。"""
    return status in {"succeeded", "failed", "cancelled"}


def poll_pipeline(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    run_id: str,
    poll_interval_seconds: float,
    poll_timeout_seconds: float,
) -> dict[str, Any]:
    """轮询后台流水线，直到脚本生成进入终态。"""
    deadline = time.monotonic() + poll_timeout_seconds
    while time.monotonic() < deadline:
        payload = request_json(client, "GET", f"{backend_base_url}/api/pipelines/{run_id}", headers=headers)
        data = extract_response_data(payload)
        if not isinstance(data, dict):
            raise KnowledgeGenerationCheckError(f"流水线返回结构无效: {json.dumps(payload, ensure_ascii=False)}")
        status = str(data.get("status") or "")
        if is_terminal_status(status):
            return data
        time.sleep(poll_interval_seconds)
    raise KnowledgeGenerationCheckError(f"流水线轮询超时: run_id={run_id}")


def fetch_script_detail(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    script_id: str,
) -> dict[str, Any]:
    """读取生成完成后的脚本详情。"""
    payload = request_json(client, "GET", f"{backend_base_url}/api/scripts/{script_id}", headers=headers)
    data = extract_response_data(payload)
    if not isinstance(data, dict):
        raise KnowledgeGenerationCheckError(f"脚本详情返回结构无效: {json.dumps(payload, ensure_ascii=False)}")
    return data


def delete_script(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    script_id: str,
) -> None:
    """删除联调中创建的脚本。"""
    request_json(client, "DELETE", f"{backend_base_url}/api/scripts/{script_id}", headers=headers)


def delete_fragment(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    fragment_id: str,
) -> None:
    """把联调中创建的测试碎片标记为已删除快照。"""
    now = time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())
    request_json(
        client,
        "POST",
        f"{backend_base_url}/api/backups/batch",
        headers=headers,
        json_body={
            "items": [
                {
                    "entity_type": "fragment",
                    "entity_id": fragment_id,
                    "entity_version": 2,
                    "operation": "delete",
                    "modified_at": now,
                    "payload": None,
                }
            ]
        },
    )


def delete_knowledge_doc(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    doc_id: str,
) -> None:
    """删除联调中创建的知识库文档。"""
    request_json(client, "DELETE", f"{backend_base_url}/api/knowledge/{doc_id}", headers=headers)


def cleanup_resources(
    client: httpx.Client,
    *,
    backend_base_url: str,
    headers: dict[str, str],
    resources: CreatedResources,
) -> None:
    """按倒序清理联调过程中创建的资源。"""
    if resources.script_id:
        try:
            delete_script(client, backend_base_url=backend_base_url, headers=headers, script_id=resources.script_id)
        except KnowledgeGenerationCheckError as exc:
            print(f"[cleanup] 删除脚本失败: {exc}")
    for fragment_id in reversed(resources.fragment_ids):
        try:
            delete_fragment(client, backend_base_url=backend_base_url, headers=headers, fragment_id=fragment_id)
        except KnowledgeGenerationCheckError as exc:
            print(f"[cleanup] 删除碎片失败: {exc}")
    for doc_id in reversed(resources.knowledge_doc_ids):
        try:
            delete_knowledge_doc(client, backend_base_url=backend_base_url, headers=headers, doc_id=doc_id)
        except KnowledgeGenerationCheckError as exc:
            print(f"[cleanup] 删除知识文档失败: {exc}")


def create_sample_files(workspace: Path) -> list[dict[str, str]]:
    """生成一组覆盖 txt/docx/pdf/xlsx 的真实上传样例。"""
    txt_path = workspace / "reference_script.txt"
    txt_path.write_text(
        "\n".join(
            [
                "标题：时间管理不是把日程塞满",
                "开头先抛一个反常识观点：越忙的人，越可能没有真正推进关键目标。",
                "中段要用生活化例子解释忙碌、优先级和执行力之间的错位。",
                "结尾给出一个简单动作：每天只保留三件最重要的事，其他都靠后。",
            ]
        ),
        encoding="utf-8",
    )

    docx_path = workspace / "high_likes.docx"
    from docx import Document

    document = Document()
    for paragraph in [
        "高赞结构一：先讲一个很多人都做错的动作，再给出更轻但更有效的替代方案。",
        "高赞结构二：每一段尽量只有一个判断句，避免信息过满导致记不住。",
        "表达建议：开头 5 秒出现冲突感，中间用数字或场景增强记忆点。",
    ]:
        document.add_paragraph(paragraph)
    document.save(docx_path)

    pdf_path = workspace / "language_habit.pdf"
    pdf_path.write_bytes(
        build_simple_pdf(
            [
                "Tone: calm and direct.",
                "Use short spoken sentences.",
                "Avoid preaching and keep the advice actionable.",
            ]
        )
    )

    xlsx_path = workspace / "language_habit.xlsx"
    build_simple_xlsx(
        xlsx_path,
        sheet_name="habits",
        rows=[
            ["section", "content"],
            ["opening", "先说现象，再点破误区"],
            ["tone", "像朋友提醒，不要像老师训话"],
            ["ending", "结尾要给一个今天就能做的小动作"],
        ],
    )

    return [
        {
            "title": "时间管理风格参考脚本",
            "doc_type": "reference_script",
            "path": str(txt_path),
            "mime_type": "text/plain",
        },
        {
            "title": "时间管理高赞表达",
            "doc_type": "high_likes",
            "path": str(docx_path),
            "mime_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
        {
            "title": "时间管理语言习惯 PDF",
            "doc_type": "language_habit",
            "path": str(pdf_path),
            "mime_type": "application/pdf",
        },
        {
            "title": "时间管理语言习惯表格",
            "doc_type": "language_habit",
            "path": str(xlsx_path),
            "mime_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
    ]


def build_simple_pdf(lines: list[str]) -> bytes:
    """构造一个可被当前 PDF 解析器读取的最小文本 PDF。"""
    escaped_lines = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines]
    content_lines = ["BT", "/F1 16 Tf", "72 720 Td"]
    for index, line in enumerate(escaped_lines):
        if index:
            content_lines.append("0 -24 Td")
        content_lines.append(f"({line}) Tj")
    content_lines.append("ET")
    stream = "\n".join(content_lines).encode("latin-1", errors="ignore")

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length %d >>\nstream\n%s\nendstream" % (len(stream), stream),
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    parts = [b"%PDF-1.4\n"]
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(sum(len(part) for part in parts))
        parts.append(f"{index} 0 obj\n".encode("ascii"))
        parts.append(obj)
        parts.append(b"\nendobj\n")
    xref_offset = sum(len(part) for part in parts)
    parts.append(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    parts.append(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        parts.append(f"{offset:010d} 00000 n \n".encode("ascii"))
    parts.append(
        (
            f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )
    return b"".join(parts)


def build_simple_xlsx(file_path: Path, *, sheet_name: str, rows: list[list[str]]) -> None:
    """构造一个使用 inlineStr 的最小 xlsx 文件。"""

    def cell_ref(row_index: int, col_index: int) -> str:
        column = ""
        current = col_index
        while current > 0:
            current, remainder = divmod(current - 1, 26)
            column = chr(65 + remainder) + column
        return f"{column}{row_index}"

    row_xml_parts: list[str] = []
    for row_index, row in enumerate(rows, start=1):
        cell_parts: list[str] = []
        for col_index, value in enumerate(row, start=1):
            escaped = xml_escape(value)
            cell_parts.append(
                f'<c r="{cell_ref(row_index, col_index)}" t="inlineStr"><is><t>{escaped}</t></is></c>'
            )
        row_xml_parts.append(f'<row r="{row_index}">{"".join(cell_parts)}</row>')

    workbook_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets><sheet name="{xml_escape(sheet_name)}" sheetId="1" r:id="rId1"/></sheets>'
        "</workbook>"
    )
    worksheet_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(row_xml_parts)}</sheetData>'
        "</worksheet>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        "</Types>"
    )
    root_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    workbook_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
        'Target="worksheets/sheet1.xml"/>'
        "</Relationships>"
    )

    with zipfile.ZipFile(file_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types_xml)
        archive.writestr("_rels/.rels", root_rels_xml)
        archive.writestr("xl/workbook.xml", workbook_xml)
        archive.writestr("xl/_rels/workbook.xml.rels", workbook_rels_xml)
        archive.writestr("xl/worksheets/sheet1.xml", worksheet_xml)


def xml_escape(text: str) -> str:
    """对 XML 文本做最小转义。"""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def build_default_fragments() -> list[str]:
    """提供一组可直接跑通生成链路的默认碎片文本。"""
    return [
        "我最近发现很多人时间管理失败，不是因为不努力，而是一天里什么都想推进。",
        "想做一期短视频，重点讲清楚忙碌感和真正产出之间的差别，再给一个马上能执行的方法。",
    ]


def summarize_search_hits(search_payload: dict[str, Any]) -> list[dict[str, Any]]:
    """提取搜索结果的关键信息，便于终端输出。"""
    items = search_payload.get("items") if isinstance(search_payload.get("items"), list) else []
    summary: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        summary.append(
            {
                "id": item.get("id"),
                "title": item.get("title"),
                "doc_type": item.get("doc_type"),
                "score": item.get("score"),
                "matched_chunks": (item.get("matched_chunks") or [])[:2],
            }
        )
    return summary


def parse_args() -> argparse.Namespace:
    """解析命令行参数。"""
    parser = argparse.ArgumentParser(description="通过真实后端接口联调知识库上传、搜索和脚本生成")
    parser.add_argument("--backend-base-url", default=DEFAULT_BACKEND_BASE_URL, help="后端基址，例如 http://127.0.0.1:8000")
    parser.add_argument("--topic", default="写一篇关于时间管理误区和执行优先级的短视频口播稿", help="本次生成的主题")
    parser.add_argument("--query-text", default="时间管理 优先级 执行 口播 风格", help="知识库搜索查询文本")
    parser.add_argument(
        "--fragment-text",
        action="append",
        default=[],
        help="要用于生成的碎片正文；可重复传入，不传时使用内置默认样例",
    )
    parser.add_argument("--search-top-k", type=int, default=5, help="知识库搜索返回数量")
    parser.add_argument("--poll-interval-seconds", type=float, default=DEFAULT_POLL_INTERVAL_SECONDS, help="轮询间隔秒数")
    parser.add_argument("--poll-timeout-seconds", type=float, default=DEFAULT_POLL_TIMEOUT_SECONDS, help="轮询超时秒数")
    parser.add_argument("--cleanup", action="store_true", help="完成后删除本次联调创建的知识文档、碎片和脚本")
    parser.add_argument("--timeout", type=float, default=30.0, help="单次 HTTP 请求超时秒数")
    return parser.parse_args()


def main() -> int:
    """执行真实知识库联调并输出结果摘要。"""
    args = parse_args()
    backend_base_url = normalize_backend_base_url(args.backend_base_url)
    fragment_texts = args.fragment_text or build_default_fragments()
    resources = CreatedResources()

    with TemporaryDirectory(prefix="sparkflow-knowledge-check-") as temp_dir:
        sample_files = create_sample_files(Path(temp_dir))
        with httpx.Client(timeout=args.timeout, follow_redirects=True) as client:
            token = issue_test_token(client, backend_base_url=backend_base_url)
            headers = build_auth_headers(token)
            reference_doc: dict[str, Any] | None = None
            try:
                uploaded_docs: list[dict[str, Any]] = []
                reference_doc_id: str | None = None
                for sample in sample_files:
                    doc = upload_knowledge_doc(
                        client,
                        backend_base_url=backend_base_url,
                        headers=headers,
                        title=sample["title"],
                        doc_type=sample["doc_type"],
                        file_path=Path(sample["path"]),
                        mime_type=sample["mime_type"],
                    )
                    doc_id = str(doc["id"])
                    resources.knowledge_doc_ids.append(doc_id)
                    uploaded_docs.append(
                        {
                            "id": doc_id,
                            "title": doc.get("title"),
                            "doc_type": doc.get("doc_type"),
                            "processing_status": doc.get("processing_status"),
                            "chunk_count": doc.get("chunk_count"),
                            "source_filename": doc.get("source_filename"),
                        }
                    )
                    if doc.get("doc_type") == "reference_script":
                        reference_doc_id = doc_id

                if reference_doc_id:
                    reference_doc = wait_for_reference_script_ready(
                        client,
                        backend_base_url=backend_base_url,
                        headers=headers,
                        doc_id=reference_doc_id,
                        poll_interval_seconds=args.poll_interval_seconds,
                        poll_timeout_seconds=args.poll_timeout_seconds,
                    )
                    if reference_doc.get("processing_status") != "ready":
                        raise KnowledgeGenerationCheckError(
                            f"reference_script 处理失败: {json.dumps(reference_doc, ensure_ascii=False)}"
                        )

                search_payload = search_knowledge_docs(
                    client,
                    backend_base_url=backend_base_url,
                    headers=headers,
                    query_text=args.query_text,
                    top_k=args.search_top_k,
                )

                for fragment_text in fragment_texts:
                    resources.fragment_ids.append(
                        create_fragment(
                            client,
                            backend_base_url=backend_base_url,
                            headers=headers,
                            body_html=f"<p>{fragment_text}</p>",
                        )
                    )

                run_id = trigger_generation(
                    client,
                    backend_base_url=backend_base_url,
                    headers=headers,
                    topic=args.topic,
                    fragment_ids=resources.fragment_ids,
                )
                pipeline = poll_pipeline(
                    client,
                    backend_base_url=backend_base_url,
                    headers=headers,
                    run_id=run_id,
                    poll_interval_seconds=args.poll_interval_seconds,
                    poll_timeout_seconds=args.poll_timeout_seconds,
                )
                if pipeline.get("status") != "succeeded":
                    raise KnowledgeGenerationCheckError(f"脚本生成失败: {json.dumps(pipeline, ensure_ascii=False)}")

                output = pipeline.get("output") if isinstance(pipeline.get("output"), dict) else {}
                script_id = output.get("script_id")
                if not isinstance(script_id, str) or not script_id.strip():
                    raise KnowledgeGenerationCheckError(f"生成成功但缺少 script_id: {json.dumps(pipeline, ensure_ascii=False)}")
                resources.script_id = script_id
                script_detail = fetch_script_detail(
                    client,
                    backend_base_url=backend_base_url,
                    headers=headers,
                    script_id=script_id,
                )

                print(
                    json.dumps(
                        {
                            "uploaded_docs": uploaded_docs,
                            "reference_script_status": reference_doc.get("processing_status") if reference_doc else None,
                            "search_hits": summarize_search_hits(search_payload),
                            "pipeline_run_id": run_id,
                            "script_id": script_id,
                            "script_title": script_detail.get("title"),
                            "script_mode": script_detail.get("mode"),
                            "body_html_preview": (script_detail.get("body_html") or "")[:300],
                        },
                        ensure_ascii=False,
                        indent=2,
                    )
                )
            finally:
                if args.cleanup:
                    cleanup_resources(client, backend_base_url=backend_base_url, headers=headers, resources=resources)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KnowledgeGenerationCheckError as exc:
        print(f"[test-knowledge-generation] {exc}")
        raise SystemExit(1)
