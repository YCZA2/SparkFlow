"""文档导入用例——校验、存储、启动流水线。"""

from __future__ import annotations

from fastapi import UploadFile
from sqlalchemy.orm import Session

from core.exceptions import ValidationError
from modules.shared.fragment_snapshots import FragmentSnapshotReader
from modules.shared.infrastructure.storage import (
    build_document_object_key,
    sanitize_filename,
    validate_document_upload,
)
from modules.shared.media.stored_file_payloads import stored_file_to_payload
from modules.shared.ports import FileStorage
from .pipeline_steps import PIPELINE_TYPE_DOCUMENT_IMPORT
from .schemas import DocumentImportResponse

_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


class DocumentImportUseCase:
    """封装文档导入任务创建入口。"""

    def __init__(self, *, pipeline_runner, file_storage: FileStorage) -> None:
        self.pipeline_runner = pipeline_runner
        self.file_storage = file_storage

    async def import_document(
        self,
        *,
        db: Session,
        user_id: str,
        file: UploadFile,
        folder_id: str | None = None,
        local_fragment_id: str,
    ) -> DocumentImportResponse:
        """校验文档、保存到对象存储、创建占位快照并启动解析流水线。"""
        normalized_local_fragment_id = str(local_fragment_id or "").strip()
        if not normalized_local_fragment_id:
            raise ValidationError(
                message="缺少本地 fragment 标识",
                field_errors={
                    "local_fragment_id": "请先创建本地占位 fragment 再导入文档"
                },
            )
        content = await file.read()
        ext, mime_type = validate_document_upload(file, content)
        if hasattr(file.file, "seek"):
            file.file.seek(0)
        stem = sanitize_filename(
            (file.filename or "document").rsplit(".", 1)[0], "document"
        )
        filename = f"{stem}{ext}"
        saved = await self.file_storage.save_upload(
            file=file,
            object_key=build_document_object_key(
                user_id=user_id,
                fragment_id=normalized_local_fragment_id,
                filename=filename,
            ),
            original_filename=filename,
            mime_type=mime_type,
        )
        _FRAGMENT_SNAPSHOT_READER.merge_server_fields(
            db=db,
            user_id=user_id,
            fragment_id=normalized_local_fragment_id,
            source="document_import",
            client_seed={
                "folder_id": folder_id,
                "body_html": "",
                "plain_text_snapshot": "",
                "content_state": "empty",
            },
            server_patch={},
        )
        run = await self.pipeline_runner.create_run(
            run_id=None,
            user_id=user_id,
            pipeline_type=PIPELINE_TYPE_DOCUMENT_IMPORT,
            input_payload={
                "document_file": stored_file_to_payload(saved),
                "source_filename": file.filename or filename,
                "local_fragment_id": normalized_local_fragment_id,
                "folder_id": folder_id,
                "source": "document_import",
            },
            resource_type="local_fragment",
            resource_id=normalized_local_fragment_id,
        )
        return DocumentImportResponse(
            pipeline_run_id=run.id,
            pipeline_type=PIPELINE_TYPE_DOCUMENT_IMPORT,
            local_fragment_id=normalized_local_fragment_id,
            source_filename=file.filename or filename,
            file_size=saved.file_size,
        )


def build_document_import_use_case(container) -> DocumentImportUseCase:
    """基于容器组装文档导入用例。"""
    return DocumentImportUseCase(
        pipeline_runner=container.pipeline_runner,
        file_storage=container.file_storage,
    )
