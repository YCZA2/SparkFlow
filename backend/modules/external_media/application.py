from __future__ import annotations

from pathlib import Path

from sqlalchemy.orm import Session

from modules.shared.audio_ingestion import AudioIngestionRequest, AudioIngestionService
from modules.shared.infrastructure import build_imported_audio_object_key, sanitize_filename
from modules.shared.ports import ExternalMediaProvider, FileStorage

from .schemas import ExternalAudioImportResponse


class ExternalMediaUseCase:
    def __init__(
        self,
        *,
        ingestion_service: AudioIngestionService,
        external_media_provider: ExternalMediaProvider,
        file_storage: FileStorage,
    ) -> None:
        """装配外链导入所需的解析、存储与转写依赖。"""
        self.ingestion_service = ingestion_service
        self.external_media_provider = external_media_provider
        self.file_storage = file_storage

    async def import_audio(
        self,
        *,
        db: Session,
        user_id: str,
        share_url: str,
        platform: str,
        folder_id: str | None = None,
    ) -> ExternalAudioImportResponse:
        """同步解析并保存外链音频，再创建后台转写流水线。"""
        await self.ingestion_service.ensure_transcription_available()
        resolved = await self.external_media_provider.resolve_audio(share_url=share_url, platform=platform)
        filename = self._build_external_filename(
            platform=resolved.platform,
            media_id=resolved.media_id,
            title=resolved.title,
        )
        object_key = build_imported_audio_object_key(
            user_id=user_id,
            fragment_id=resolved.media_id,
            platform=resolved.platform,
            filename=filename,
        )
        try:
            saved = await self.file_storage.save_local_file(
                source_path=resolved.local_audio_path,
                object_key=object_key,
                original_filename=filename,
                mime_type="audio/m4a",
            )
        finally:
            await self._cleanup_temp_file(resolved.local_audio_path)

        access = self.file_storage.create_download_url(saved)
        ingestion_result = await self.ingestion_service.ingest_audio(
            db=db,
            request=AudioIngestionRequest(
                user_id=user_id,
                fragment_id=None,
                audio_file=saved,
                folder_id=folder_id,
                audio_source="external_link",
                source_context={
                    "platform": resolved.platform,
                    "share_url": resolved.share_url,
                    "media_id": resolved.media_id,
                    "title": resolved.title,
                    "author": resolved.author,
                    "cover_url": resolved.cover_url,
                    "content_type": resolved.content_type,
                    "audio_file_url": access.url,
                    "audio_file_expires_at": access.expires_at,
                },
            ),
        )
        return ExternalAudioImportResponse(
            pipeline_run_id=ingestion_result.pipeline_run_id,
            pipeline_type="media_ingestion",
            fragment_id=ingestion_result.fragment_id,
            source=ingestion_result.source,
            audio_source=ingestion_result.audio_source,
            platform=resolved.platform,
            share_url=resolved.share_url,
            media_id=resolved.media_id,
            title=resolved.title,
            author=resolved.author,
            cover_url=resolved.cover_url,
            content_type=resolved.content_type,
            audio_file_url=access.url,
            audio_file_expires_at=access.expires_at,
        )

    @staticmethod
    def _build_external_filename(*, platform: str, media_id: str, title: str | None) -> str:
        """根据平台与标题生成稳定的导入文件名。"""
        stem = sanitize_filename(title or platform, platform)
        if stem == platform:
            return f"{platform}-{media_id}.m4a"
        return f"{stem}-{media_id}.m4a"

    @staticmethod
    async def _cleanup_temp_file(path_value: str | None) -> None:
        """清理解析阶段产生的本地临时音频文件。"""
        if not path_value:
            return
        path = Path(path_value)
        try:
            path.unlink(missing_ok=True)
        except TypeError:
            if path.exists():
                path.unlink()
        try:
            path.parent.rmdir()
        except OSError:
            pass
