from __future__ import annotations

from sqlalchemy.orm import Session

from modules.shared.audio_ingestion import AudioIngestionService

from .schemas import ExternalAudioImportResponse


class ExternalMediaUseCase:
    def __init__(
        self,
        *,
        ingestion_service: AudioIngestionService,
    ) -> None:
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
        await self.ingestion_service.ensure_transcription_available()
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
            sync_status=ingestion_result.sync_status,
            source=ingestion_result.source,
            audio_source=ingestion_result.audio_source,
            platform=platform,
            share_url=share_url,
        )
