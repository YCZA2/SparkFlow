"""文档导入模块的纯单元测试。"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from modules.document_import.pipeline_steps import (
    DocumentImportStepExecutor,
    PIPELINE_TYPE_DOCUMENT_IMPORT,
)


def test_pipeline_type_constant() -> None:
    """文档导入流水线类型标识应保持稳定。"""
    assert PIPELINE_TYPE_DOCUMENT_IMPORT == "document_import"


def test_pipeline_definitions_have_expected_steps() -> None:
    """文档导入流水线应包含三个步骤。"""
    executor = DocumentImportStepExecutor()
    definitions = executor.build_pipeline_definitions()
    assert len(definitions) == 3
    assert definitions[0].step_name == "parse_document"
    assert definitions[1].step_name == "write_fragment_body"
    assert definitions[2].step_name == "finalize_import"


def test_pipeline_step_max_attempts() -> None:
    """解析步骤可重试，写入和终态步骤不可重试。"""
    executor = DocumentImportStepExecutor()
    definitions = executor.build_pipeline_definitions()
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
