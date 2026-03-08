from __future__ import annotations

import asyncio
from pathlib import Path

from sqlalchemy.orm import Session

from modules.shared.audio_ingestion import AudioIngestionRequest, AudioIngestionService
from modules.shared.ports import ExternalMediaProvider, ImportedAudioStorage
from modules.shared.ports import JobRunner

from .schemas import ExternalAudioImportResponse


class ExternalMediaUseCase:
    def __init__(
        self,
        *,
        external_media_provider: ExternalMediaProvider,
        imported_audio_storage: ImportedAudioStorage,
        ingestion_service: AudioIngestionService,
    ) -> None:
        self.external_media_provider = external_media_provider
        self.imported_audio_storage = imported_audio_storage
        self.ingestion_service = ingestion_service

    async def import_audio(
        self,
        *,
        db: Session,
        user_id: str,
        share_url: str,
        platform: str,
        runner: JobRunner,
        session_factory,
        folder_id: str | None = None,
    ) -> ExternalAudioImportResponse:
        await self.ingestion_service.ensure_transcription_available()
        resolved = await self.external_media_provider.resolve_audio(share_url=share_url, platform=platform)
        filename = self._build_filename(
            platform=resolved.platform,
            media_id=resolved.media_id,
            title=resolved.title,
        )

        try:
            saved = await self.imported_audio_storage.save_file(
                source_path=resolved.local_audio_path,
                user_id=user_id,
                platform=resolved.platform,
                filename=filename,
            )
        finally:
            await self._cleanup_temp(resolved.local_audio_path)

        relative_path = self._to_posix(saved["relative_path"])
        ingestion_result = await self.ingestion_service.ingest_audio(
            db=db,
            request=AudioIngestionRequest(
                user_id=user_id,
                audio_path=relative_path,
                folder_id=folder_id,
                audio_source="external_link",
                source_context={
                    "platform": resolved.platform,
                    "share_url": resolved.share_url,
                    "media_id": resolved.media_id,
                },
            ),
            runner=runner,
            session_factory=session_factory,
        )
        return ExternalAudioImportResponse(
            fragment_id=ingestion_result.fragment_id,
            sync_status=ingestion_result.sync_status,
            source=ingestion_result.source,
            audio_source=ingestion_result.audio_source,
            platform=resolved.platform,
            share_url=resolved.share_url,
            media_id=resolved.media_id,
            title=resolved.title,
            author=resolved.author,
            cover_url=resolved.cover_url,
            content_type=resolved.content_type,
            audio_relative_path=relative_path,
            audio_public_url=f"/{relative_path}",
        )

    @staticmethod
    def _build_filename(*, platform: str, media_id: str, title: str | None) -> str:
        safe_title = "".join("_" if ch in '\\/:*?"<>|' else ch for ch in (title or "").strip())
        safe_title = " ".join(safe_title.split()).strip(" .")
        stem = safe_title[:80] if safe_title else platform
        if stem == platform:
            return f"{platform}-{media_id}.m4a"
        return f"{stem}-{media_id}.m4a"

    @staticmethod
    def _to_posix(path_value: str) -> str:
        return Path(path_value).as_posix()

    @staticmethod
    async def _cleanup_temp(path_value: str | None) -> None:
        if not path_value:
            return
        path = Path(path_value)
        try:
            await asyncio.to_thread(path.unlink, missing_ok=True)
        except TypeError:
            if path.exists():
                await asyncio.to_thread(path.unlink)
        parent = path.parent
        try:
            parent.rmdir()
        except OSError:
            pass
