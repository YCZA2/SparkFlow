from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any, Optional, Protocol

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ServiceUnavailableError, ValidationError
from core.logging_config import get_logger
from domains.fragment_folders import repository as fragment_folder_repository
from domains.fragments import repository as fragment_repository
from modules.shared.enrichment import build_fallback_summary_and_tags, generate_summary_and_tags
from modules.shared.ports import JobRunner, SpeechToTextProvider, TextGenerationProvider, VectorStore

logger = get_logger(__name__)
ENRICHMENT_TIMEOUT_SECONDS = 45.0


@dataclass
class AudioIngestionRequest:
    user_id: str
    audio_path: str
    audio_source: str
    folder_id: str | None = None
    source_context: dict[str, Any] = field(default_factory=dict)


@dataclass
class AudioIngestionResult:
    fragment_id: str
    audio_path: str
    sync_status: str
    source: str
    audio_source: str


class AudioIngestionHooks(Protocol):
    async def before_create_fragment(self, *, db: Session, request: AudioIngestionRequest) -> None: ...
    async def before_schedule_transcription(self, *, db: Session, request: AudioIngestionRequest, fragment_id: str) -> None: ...
    async def after_transcription_succeeded(
        self,
        *,
        db: Session,
        request: AudioIngestionRequest,
        fragment_id: str,
        transcript: str,
        summary: str,
        tags: list[str],
    ) -> None: ...
    async def after_transcription_failed(
        self,
        *,
        db: Session,
        request: AudioIngestionRequest,
        fragment_id: str,
        error: str | None,
    ) -> None: ...


class NoopAudioIngestionHooks:
    async def before_create_fragment(self, *, db: Session, request: AudioIngestionRequest) -> None:
        return None

    async def before_schedule_transcription(self, *, db: Session, request: AudioIngestionRequest, fragment_id: str) -> None:
        return None

    async def after_transcription_succeeded(
        self,
        *,
        db: Session,
        request: AudioIngestionRequest,
        fragment_id: str,
        transcript: str,
        summary: str,
        tags: list[str],
    ) -> None:
        return None

    async def after_transcription_failed(
        self,
        *,
        db: Session,
        request: AudioIngestionRequest,
        fragment_id: str,
        error: str | None,
    ) -> None:
        return None


class AudioIngestionService:
    def __init__(
        self,
        *,
        stt_provider: SpeechToTextProvider,
        llm_provider: TextGenerationProvider,
        vector_store: VectorStore,
        hooks: AudioIngestionHooks | None = None,
    ) -> None:
        """初始化音频导入服务依赖。"""
        self.stt_provider = stt_provider
        self.llm_provider = llm_provider
        self.vector_store = vector_store
        self.hooks = hooks or NoopAudioIngestionHooks()

    async def ensure_transcription_available(self) -> None:
        """在上传前检查转写服务是否可用。"""
        try:
            is_available = await self.stt_provider.health_check()
            if not is_available:
                raise RuntimeError("health check returned unavailable")
        except Exception as exc:
            raise ServiceUnavailableError(
                message=f"语音转写服务暂时不可用: {str(exc)}",
                service_name="stt",
            ) from exc

    async def ingest_audio(
        self,
        *,
        db: Session,
        request: AudioIngestionRequest,
        runner: JobRunner,
        session_factory,
    ) -> AudioIngestionResult:
        """创建碎片并调度后台转写任务。"""
        self._validate_audio_source(request.audio_source)
        self._validate_folder_exists(db=db, user_id=request.user_id, folder_id=request.folder_id)
        await self.hooks.before_create_fragment(db=db, request=request)
        fragment = fragment_repository.create(
            db=db,
            user_id=request.user_id,
            transcript=None,
            source="voice",
            audio_source=request.audio_source,
            audio_path=request.audio_path,
            sync_status="syncing",
            folder_id=request.folder_id,
        )
        await self.hooks.before_schedule_transcription(db=db, request=request, fragment_id=fragment.id)
        runner.schedule(
            self.process_transcription,
            request=request,
            fragment_id=fragment.id,
            session_factory=session_factory,
        )
        return AudioIngestionResult(
            fragment_id=fragment.id,
            audio_path=request.audio_path,
            sync_status="syncing",
            source="voice",
            audio_source=request.audio_source,
        )

    async def _generate_enrichment(self, transcript: str) -> tuple[str, list[str]]:
        """生成摘要与标签，并在超时时落回本地策略。"""
        try:
            return await generate_summary_and_tags(
                transcript,
                llm_provider=self.llm_provider,
                timeout_seconds=ENRICHMENT_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.warning("enrichment_timeout", transcript_length=len(transcript or ""))
            return build_fallback_summary_and_tags(transcript)

    async def process_transcription(
        self,
        *,
        request: AudioIngestionRequest,
        fragment_id: str,
        session_factory,
        max_retries: int = 2,
    ) -> dict[str, Any]:
        """执行完整的转写、摘要和向量写入后台链路。"""
        last_error: str | None = None
        bound_logger = logger.bind(
            fragment_id=fragment_id,
            user_id=request.user_id,
            provider=type(self.stt_provider).__name__,
        )
        try:
            for attempt in range(max_retries + 1):
                try:
                    result = await self.stt_provider.transcribe(request.audio_path)
                    transcript = result.text or ""
                    summary, tags = await self._generate_enrichment(transcript)
                    speaker_segments = getattr(result, "speaker_segments", None) or []
                    normalized_segments = self._normalize_speaker_segments(speaker_segments)
                    with session_factory() as db:
                        updated = fragment_repository.mark_synced(
                            db=db,
                            fragment_id=fragment_id,
                            user_id=request.user_id,
                            transcript=transcript,
                            summary=summary,
                            tags_json=json.dumps(tags, ensure_ascii=False),
                            speaker_segments_json=json.dumps(normalized_segments, ensure_ascii=False) if normalized_segments else None,
                        )
                        if updated:
                            await self.hooks.after_transcription_succeeded(
                                db=db,
                                request=request,
                                fragment_id=fragment_id,
                                transcript=transcript,
                                summary=summary,
                                tags=tags,
                            )
                    if updated:
                        try:
                            await self.vector_store.upsert_fragment(
                                user_id=request.user_id,
                                fragment_id=fragment_id,
                                text=transcript,
                                source="voice",
                                summary=summary,
                                tags=tags,
                            )
                        except Exception:
                            bound_logger.warning("vectorization_failed", attempt=attempt, exc_info=True)
                    return {"success": True, "fragment_id": fragment_id, "transcript": transcript}
                except Exception as exc:
                    last_error = str(exc)
                    bound_logger.error("transcription_attempt_failed", attempt=attempt, error=last_error)
                    if attempt < max_retries:
                        await asyncio.sleep((2 ** (attempt + 1)) - 1)
        except asyncio.CancelledError:
            last_error = "transcription job cancelled"
            bound_logger.warning("transcription_job_cancelled")

        with session_factory() as db:
            fragment_repository.mark_failed(db=db, fragment_id=fragment_id, user_id=request.user_id)
            await self.hooks.after_transcription_failed(
                db=db,
                request=request,
                fragment_id=fragment_id,
                error=last_error,
            )
        return {"success": False, "fragment_id": fragment_id, "error": last_error}

    @staticmethod
    def _normalize_speaker_segments(speaker_segments: list[Any]) -> list[dict[str, Any]]:
        """将供应商分段结构归一化为可持久化字典。"""
        normalized_segments = []
        for segment in speaker_segments:
            if isinstance(segment, dict):
                speaker_id = segment.get("speaker_id")
                start_ms = segment.get("start_ms")
                end_ms = segment.get("end_ms")
                text = segment.get("text")
            else:
                speaker_id = getattr(segment, "speaker_id", None)
                start_ms = getattr(segment, "start_ms", None)
                end_ms = getattr(segment, "end_ms", None)
                text = getattr(segment, "text", None)
            if speaker_id is None or start_ms is None or end_ms is None or text is None:
                continue
            normalized_segments.append(
                {
                    "speaker_id": str(speaker_id),
                    "start_ms": int(start_ms),
                    "end_ms": int(end_ms),
                    "text": str(text),
                }
            )
        return normalized_segments

    @staticmethod
    def _validate_audio_source(audio_source: str) -> None:
        """校验允许的音频来源枚举。"""
        if audio_source not in {"upload", "external_link"}:
            raise ValidationError(
                message="无效的 audio_source 值",
                field_errors={"audio_source": "必须是 upload 或 external_link"},
            )

    @staticmethod
    def _validate_folder_exists(db: Session, user_id: str, folder_id: Optional[str]) -> None:
        """校验目标文件夹存在且属于当前用户。"""
        if folder_id is None:
            return
        folder = fragment_folder_repository.get_by_id(db=db, user_id=user_id, folder_id=folder_id)
        if not folder:
            raise NotFoundError(
                message="文件夹不存在或无权访问",
                resource_type="fragment_folder",
                resource_id=folder_id,
            )
