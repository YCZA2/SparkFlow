from __future__ import annotations

from fastapi import UploadFile
from sqlalchemy.orm import Session

from core.exceptions import ValidationError
from modules.shared.fragment_snapshots import FragmentSnapshotReader
from modules.shared.media.audio_ingestion import AudioIngestionRequest
from modules.shared.media.audio_ingestion_use_case import AudioIngestionUseCase
from modules.shared.infrastructure.storage import build_audio_object_key, sanitize_filename, validate_audio_upload
from modules.shared.ports import FileStorage
from .schemas import AudioUploadResponse

_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


class TranscriptionUseCase:
    def __init__(
        self,
        *,
        file_storage: FileStorage,
        ingestion_service: AudioIngestionUseCase,
    ) -> None:
        """装配录音上传所需的对象存储与导入服务。"""
        self.file_storage = file_storage
        self.ingestion_service = ingestion_service

    async def upload_audio(
        self,
        *,
        db: Session,
        user_id: str,
        audio: UploadFile,
        folder_id: str | None = None,
        local_fragment_id: str,
    ) -> AudioUploadResponse:
        """上传录音文件、落库对象元数据并启动转写流水线。"""
        normalized_local_fragment_id = str(local_fragment_id or "").strip()
        if not normalized_local_fragment_id:
            raise ValidationError(
                message="缺少本地 fragment 标识",
                field_errors={"local_fragment_id": "请先创建本地占位 fragment 再上传音频"},
            )
        await self.ingestion_service.ensure_transcription_available()
        content = await audio.read()
        ext, mime_type = validate_audio_upload(audio, content)
        if hasattr(audio.file, "seek"):
            audio.file.seek(0)
        stem = sanitize_filename((audio.filename or "recording").rsplit(".", 1)[0], "recording")
        saved = await self.file_storage.save_upload(
            file=audio,
            object_key=build_audio_object_key(
                user_id=user_id,
                fragment_id=normalized_local_fragment_id,
                filename=f"{stem}{ext}",
            ),
            original_filename=f"{stem}{ext}",
            mime_type=mime_type,
        )
        access = self.file_storage.create_download_url(saved)
        _FRAGMENT_SNAPSHOT_READER.merge_server_fields(
            db=db,
            user_id=user_id,
            fragment_id=normalized_local_fragment_id,
            source="voice",
            audio_source="upload",
            client_seed={
                "folder_id": folder_id,
                "body_html": "",
                "plain_text_snapshot": "",
                "content_state": "empty",
            },
            server_patch={
                "audio_object_key": saved.object_key,
                "audio_file_url": access.url,
                "audio_file_expires_at": access.expires_at,
            },
        )
        result = await self.ingestion_service.ingest_audio(
            db=db,
            request=AudioIngestionRequest(
                user_id=user_id,
                fragment_id=None,
                local_fragment_id=normalized_local_fragment_id,
                audio_file=saved,
                folder_id=folder_id,
                audio_source="upload",
            ),
        )
        return AudioUploadResponse(
            task_id=result.pipeline_run_id,
            task_type="media_ingestion",
            status_query_url=f"/api/tasks/{result.pipeline_run_id}",
            pipeline_run_id=result.pipeline_run_id,
            pipeline_type="media_ingestion",
            fragment_id=result.fragment_id,
            local_fragment_id=normalized_local_fragment_id,
            audio_object_key=saved.object_key,
            audio_file_url=access.url,
            audio_file_expires_at=access.expires_at,
            file_size=saved.file_size,
            duration=None,
        )
