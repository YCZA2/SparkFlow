from __future__ import annotations

from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from domains.fragments import repository as fragment_repository
from modules.fragments.application import map_fragment
from modules.shared.audio_ingestion import AudioIngestionRequest, AudioIngestionService
from modules.shared.infrastructure import build_audio_object_key, sanitize_filename, validate_audio_upload
from modules.shared.ports import FileStorage
from .schemas import AudioUploadResponse, TranscriptionStatusResponse


class TranscriptionUseCase:
    def __init__(
        self,
        *,
        file_storage: FileStorage,
        ingestion_service: AudioIngestionService,
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
    ) -> AudioUploadResponse:
        """上传录音文件、落库对象元数据并启动转写流水线。"""
        await self.ingestion_service.ensure_transcription_available()
        content = await audio.read()
        ext, mime_type = validate_audio_upload(audio, content)
        fragment = fragment_repository.create(
            db=db,
            user_id=user_id,
            transcript=None,
            source="voice",
            audio_source="upload",
            audio_storage_provider=None,
            audio_bucket=None,
            audio_object_key=None,
            audio_access_level=None,
            audio_original_filename=None,
            audio_mime_type=None,
            audio_file_size=None,
            audio_checksum=None,
            folder_id=folder_id,
        )
        if hasattr(audio.file, "seek"):
            audio.file.seek(0)
        stem = sanitize_filename(Path(audio.filename or "recording").stem, "recording")
        saved = await self.file_storage.save_upload(
            file=audio,
            object_key=build_audio_object_key(user_id=user_id, fragment_id=fragment.id, filename=f"{stem}{ext}"),
            original_filename=f"{stem}{ext}",
            mime_type=mime_type,
        )
        fragment_repository.update_audio_file(
            db=db,
            fragment_id=fragment.id,
            user_id=user_id,
            audio_storage_provider=saved.storage_provider,
            audio_bucket=saved.bucket,
            audio_object_key=saved.object_key,
            audio_access_level=saved.access_level,
            audio_original_filename=saved.original_filename,
            audio_mime_type=saved.mime_type,
            audio_file_size=saved.file_size,
            audio_checksum=saved.checksum,
        )
        result = await self.ingestion_service.ingest_audio(
            db=db,
            request=AudioIngestionRequest(
                user_id=user_id,
                fragment_id=fragment.id,
                audio_file=saved,
                folder_id=folder_id,
                audio_source="upload",
            ),
        )
        access = self.file_storage.create_download_url(saved)
        return AudioUploadResponse(
            pipeline_run_id=result.pipeline_run_id,
            pipeline_type="media_ingestion",
            fragment_id=result.fragment_id,
            audio_file_url=access.url,
            audio_file_expires_at=access.expires_at,
            file_size=saved.file_size,
            duration=None,
        )

    def get_status(self, *, db: Session, user_id: str, fragment_id: str) -> TranscriptionStatusResponse:
        """读取当前碎片的任务态详情。"""
        fragment = fragment_repository.get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
        if not fragment:
            from core.exceptions import NotFoundError
            raise NotFoundError(message="碎片笔记不存在或无权访问", resource_type="fragment", resource_id=fragment_id)
        payload = map_fragment(fragment, file_storage=self.file_storage).model_dump()
        payload["fragment_id"] = payload["id"]
        return TranscriptionStatusResponse.model_validate(payload)
