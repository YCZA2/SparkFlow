from __future__ import annotations

from fastapi import UploadFile
from sqlalchemy.orm import Session

from domains.fragments import repository as fragment_repository
from modules.fragments.application import map_fragment
from modules.shared.audio_ingestion import AudioIngestionRequest, AudioIngestionService
from modules.shared.ports import AudioStorage
from .schemas import AudioUploadResponse, TranscriptionStatusResponse


class TranscriptionUseCase:
    def __init__(
        self,
        *,
        audio_storage: AudioStorage,
        ingestion_service: AudioIngestionService,
    ) -> None:
        self.audio_storage = audio_storage
        self.ingestion_service = ingestion_service

    async def upload_audio(
        self,
        *,
        db: Session,
        user_id: str,
        audio: UploadFile,
        folder_id: str | None = None,
    ) -> AudioUploadResponse:
        await self.ingestion_service.ensure_transcription_available()
        saved = await self.audio_storage.save(audio=audio, user_id=user_id)
        result = await self.ingestion_service.ingest_audio(
            db=db,
            request=AudioIngestionRequest(
                user_id=user_id,
                audio_path=saved["relative_path"],
                folder_id=folder_id,
                audio_source="upload",
            ),
        )
        return AudioUploadResponse(
            pipeline_run_id=result.pipeline_run_id,
            pipeline_type="media_ingestion",
            fragment_id=result.fragment_id,
            audio_path=saved["file_path"],
            relative_path=saved["relative_path"],
            file_size=saved["file_size"],
            duration=None,
            sync_status=result.sync_status,
        )

    def get_status(self, *, db: Session, user_id: str, fragment_id: str) -> TranscriptionStatusResponse:
        fragment = fragment_repository.get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
        if not fragment:
            from core.exceptions import NotFoundError
            raise NotFoundError(message="碎片笔记不存在或无权访问", resource_type="fragment", resource_id=fragment_id)
        payload = map_fragment(fragment).model_dump()
        payload["fragment_id"] = payload["id"]
        return TranscriptionStatusResponse.model_validate(payload)
