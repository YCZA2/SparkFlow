"""文档导入模块的纯单元测试。"""

from __future__ import annotations

import io
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from core.exceptions import NotFoundError
from modules.document_import.application import DocumentImportUseCase
from modules.auth.application import TEST_USER_ID
from modules.shared.fragment_snapshots import FragmentSnapshotReader
from modules.shared.tasks.task_types import TaskExecutionContext

from modules.document_import.task_steps import (
    DocumentImportStepExecutor,
    TASK_TYPE_DOCUMENT_IMPORT,
)


def test_task_type_constant() -> None:
    """文档导入任务类型标识应保持稳定。"""
    assert TASK_TYPE_DOCUMENT_IMPORT == "document_import"


def test_task_definitions_have_expected_steps() -> None:
    """文档导入任务应包含三个步骤。"""
    executor = DocumentImportStepExecutor()
    definitions = executor.build_task_definitions()
    assert len(definitions) == 3
    assert definitions[0].step_name == "parse_document"
    assert definitions[1].step_name == "write_fragment_body"
    assert definitions[2].step_name == "finalize_import"


def test_task_step_max_attempts() -> None:
    """解析步骤可重试，写入和终态步骤不可重试。"""
    executor = DocumentImportStepExecutor()
    definitions = executor.build_task_definitions()
    assert definitions[0].max_attempts == 2
    assert definitions[1].max_attempts == 1
    assert definitions[2].max_attempts == 1


def test_shared_parsers_support_md() -> None:
    """共享解析器应支持 Markdown 文件。"""
    from modules.shared.content.document_parsers import parse_uploaded_text

    result = parse_uploaded_text(
        file_content="# 标题\n\n正文内容".encode("utf-8"), filename="test.md"
    )
    assert "标题" in result
    assert "正文内容" in result


def test_shared_parsers_md_rejects_non_utf8() -> None:
    """Markdown 解析器应对非 UTF-8 编码抛出校验错误。"""
    from core.exceptions import ValidationError
    from modules.shared.content.document_parsers import parse_uploaded_text

    with pytest.raises(ValidationError):
        parse_uploaded_text(file_content=b"\xff\xfe", filename="bad.md")


def test_shared_parsers_rejects_unsupported_format() -> None:
    """共享解析器应对不支持的格式抛出校验错误。"""
    from core.exceptions import ValidationError
    from modules.shared.content.document_parsers import parse_uploaded_text

    with pytest.raises(ValidationError, match="文件格式不支持"):
        parse_uploaded_text(file_content=b"data", filename="file.rtf")


def test_document_upload_validation() -> None:
    """文档上传校验应接受支持的格式并拒绝不支持的格式。"""
    from modules.shared.infrastructure.storage import (
        ALLOWED_DOCUMENT_EXTENSIONS,
        validate_document_upload,
    )
    from core.exceptions import ValidationError

    assert ".md" in ALLOWED_DOCUMENT_EXTENSIONS
    assert ".xlsx" in ALLOWED_DOCUMENT_EXTENSIONS

    valid_file = MagicMock()
    valid_file.filename = "test.docx"
    valid_file.content_type = (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    ext, mime = validate_document_upload(valid_file, b"content")
    assert ext == ".docx"

    invalid_file = MagicMock()
    invalid_file.filename = "image.png"
    invalid_file.content_type = "image/png"
    with pytest.raises(ValidationError, match="不支持"):
        validate_document_upload(invalid_file, b"content")


@pytest.mark.asyncio
async def test_write_fragment_body_updates_snapshot_fields(monkeypatch) -> None:
    """正文写回步骤应把 HTML、纯文本快照和状态传给 snapshot 写回层。"""
    executor = DocumentImportStepExecutor()
    captured: dict[str, object] = {}

    def _capture_merge_server_fields(**kwargs) -> None:
        captured.update(kwargs)

    monkeypatch.setattr(
        "modules.document_import.task_steps._FRAGMENT_SNAPSHOT_READER.merge_server_fields",
        _capture_merge_server_fields,
    )
    context = TaskExecutionContext(
        db=SimpleNamespace(),
        session_factory=SimpleNamespace(),
        run=SimpleNamespace(
            user_id=TEST_USER_ID,
            input_payload_json='{"local_fragment_id":"frag-doc-001"}',
        ),
        step=SimpleNamespace(),
        container=SimpleNamespace(),
        step_outputs={"parse_document": {"plain_text": "# 标题\n\n正文内容"}},
    )

    output = await executor.write_fragment_body(context)

    assert output["content_state"] == "body_present"
    assert captured["fragment_id"] == "frag-doc-001"
    assert captured["server_patch"] == {}
    assert captured["snapshot_patch"] == {
        "body_html": "<h1>标题</h1><p>正文内容</p>",
        "plain_text_snapshot": "标题 正文内容",
        "content_state": "body_present",
    }


@pytest.mark.asyncio
async def test_document_import_use_case_rejects_invalid_folder(monkeypatch) -> None:
    """文档导入入口应拒绝不存在或无权访问的文件夹。"""
    task_runner = SimpleNamespace(create_run=AsyncMock())
    file_storage = SimpleNamespace(save_upload=AsyncMock())
    use_case = DocumentImportUseCase(
        task_runner=task_runner,
        file_storage=file_storage,
    )
    upload = UploadFile(
        file=io.BytesIO("正文内容".encode("utf-8")),
        filename="notes.txt",
        headers=Headers({"content-type": "text/plain"}),
    )
    monkeypatch.setattr(
        "modules.document_import.application.fragment_folder_repository.get_by_id",
        lambda **kwargs: None,
    )

    with pytest.raises(NotFoundError, match="文件夹不存在或无权访问"):
        await use_case.import_document(
            db=SimpleNamespace(),
            user_id=TEST_USER_ID,
            file=upload,
            folder_id="missing-folder",
            local_fragment_id="frag-doc-invalid-folder",
        )

    file_storage.save_upload.assert_not_awaited()
    task_runner.create_run.assert_not_awaited()


def test_merge_server_fields_can_patch_snapshot_structure(monkeypatch) -> None:
    """服务端补写应支持正文结构字段，同时保留服务器拥有字段。"""
    reader = FragmentSnapshotReader()
    saved_call: dict[str, object] = {}

    class _FakeDb:
        def __init__(self) -> None:
            self.committed = False

        def commit(self) -> None:
            self.committed = True

    def _capture_upsert_record(**kwargs) -> None:
        saved_call.update(kwargs)

    monkeypatch.setattr(
        "modules.shared.fragment_snapshots.backup_repository.get_record",
        lambda **kwargs: None,
    )
    monkeypatch.setattr(
        "modules.shared.fragment_snapshots.backup_repository.upsert_record",
        _capture_upsert_record,
    )
    fake_db = _FakeDb()
    reader.merge_server_fields(
        db=fake_db,
        user_id=TEST_USER_ID,
        fragment_id="frag-doc-merge",
        source="document_import",
        client_seed={
            "body_html": "",
            "plain_text_snapshot": "",
            "content_state": "empty",
        },
        server_patch={"summary": "新摘要"},
        snapshot_patch={
            "body_html": "<p>服务端正文</p>",
            "plain_text_snapshot": "服务端正文",
            "content_state": "body_present",
        },
    )
    payload = json.loads(str(saved_call["payload_json"]))

    assert fake_db.committed is True
    assert payload["summary"] == "新摘要"
    assert payload["body_html"] == "<p>服务端正文</p>"
    assert payload["plain_text_snapshot"] == "服务端正文"
    assert payload["content_state"] == "body_present"
