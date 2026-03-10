from __future__ import annotations

from sqlalchemy.orm import Session

from modules.shared.audio_ingestion_use_case import AudioIngestionUseCase

from .schemas import ExternalAudioImportResponse


class ExternalMediaUseCase:
    def __init__(
        self,
        *,
        ingestion_service: AudioIngestionUseCase,
    ) -> None:
        """装配外链导入任务创建所需依赖。"""
        self.ingestion_service = ingestion_service

    async def import_audio(
        self,
        *,
        db: Session,
        user_id: str,
        share_url: str,
        platform: str,
        folder_id: str | None = None,
    ) -> ExternalAudioImportResponse:
        """创建全异步外链导入流水线，并返回任务句柄。"""
        ingestion_result = await self.ingestion_service.ingest_external_media(
            db=db,
            user_id=user_id,
            share_url=share_url,
            platform=platform,
            folder_id=folder_id,
        )
        return ExternalAudioImportResponse(
            pipeline_run_id=ingestion_result.pipeline_run_id,
            pipeline_type="media_ingestion",
            fragment_id=ingestion_result.fragment_id,
            source=ingestion_result.source,
            audio_source=ingestion_result.audio_source,
        )
