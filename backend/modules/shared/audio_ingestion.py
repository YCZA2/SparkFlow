from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ServiceUnavailableError, ValidationError
from core.logging_config import get_logger
from domains.fragment_folders import repository as fragment_folder_repository
from domains.fragments import repository as fragment_repository
from models import generate_uuid
from modules.shared.enrichment import build_fallback_summary_and_tags, generate_summary_and_tags
from modules.shared.pipeline_runtime import PipelineExecutionContext, PipelineStepDefinition
from modules.shared.ports import (
    ExternalMediaProvider,
    ImportedAudioStorage,
    SpeechToTextProvider,
    TextGenerationProvider,
    VectorStore,
)

logger = get_logger(__name__)
ENRICHMENT_TIMEOUT_SECONDS = 45.0
PIPELINE_TYPE_MEDIA_INGESTION = "media_ingestion"


@dataclass
class AudioIngestionRequest:
    user_id: str
    audio_path: str | None
    audio_source: str
    folder_id: str | None = None
    source_context: dict[str, Any] = field(default_factory=dict)


@dataclass
class AudioIngestionResult:
    pipeline_run_id: str
    fragment_id: str | None
    audio_path: str | None
    source: str
    audio_source: str


class AudioIngestionService:
    def __init__(
        self,
        *,
        stt_provider: SpeechToTextProvider,
        llm_provider: TextGenerationProvider,
        vector_store: VectorStore,
        pipeline_runner,
        external_media_provider: ExternalMediaProvider | None = None,
        imported_audio_storage: ImportedAudioStorage | None = None,
    ) -> None:
        """初始化媒体导入流水线依赖。"""
        self.stt_provider = stt_provider
        self.llm_provider = llm_provider
        self.vector_store = vector_store
        self.pipeline_runner = pipeline_runner
        self.external_media_provider = external_media_provider
        self.imported_audio_storage = imported_audio_storage

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
    ) -> AudioIngestionResult:
        """创建上传音频流水线并返回异步任务句柄。"""
        self._validate_audio_source(request.audio_source)
        self._validate_folder_exists(db=db, user_id=request.user_id, folder_id=request.folder_id)
        fragment = fragment_repository.create(
            db=db,
            user_id=request.user_id,
            transcript=None,
            source="voice",
            audio_source=request.audio_source,
            audio_path=request.audio_path,
            folder_id=request.folder_id,
        )
        run = await self.pipeline_runner.create_run(
            run_id=None,
            user_id=request.user_id,
            pipeline_type=PIPELINE_TYPE_MEDIA_INGESTION,
            input_payload={
                "source_kind": request.audio_source,
                "audio_path": request.audio_path,
                "folder_id": request.folder_id,
                "fragment_id": fragment.id,
                "source_context": request.source_context,
            },
            resource_type="fragment",
            resource_id=fragment.id,
        )
        return AudioIngestionResult(
            pipeline_run_id=run.id,
            fragment_id=fragment.id,
            audio_path=request.audio_path,
            source="voice",
            audio_source=request.audio_source,
        )

    async def ingest_external_media(
        self,
        *,
        db: Session,
        user_id: str,
        share_url: str,
        platform: str,
        folder_id: str | None = None,
    ) -> AudioIngestionResult:
        """创建外链导入流水线并返回异步任务句柄。"""
        self._validate_folder_exists(db=db, user_id=user_id, folder_id=folder_id)
        fragment = fragment_repository.create(
            db=db,
            user_id=user_id,
            transcript=None,
            source="voice",
            audio_source="external_link",
            audio_path=None,
            folder_id=folder_id,
        )
        run = await self.pipeline_runner.create_run(
            run_id=None,
            user_id=user_id,
            pipeline_type=PIPELINE_TYPE_MEDIA_INGESTION,
            input_payload={
                "source_kind": "external_link",
                "fragment_id": fragment.id,
                "folder_id": folder_id,
                "share_url": share_url,
                "platform": platform,
            },
            resource_type="fragment",
            resource_id=fragment.id,
        )
        return AudioIngestionResult(
            pipeline_run_id=run.id,
            fragment_id=fragment.id,
            audio_path=None,
            source="voice",
            audio_source="external_link",
        )

    def build_pipeline_definitions(self) -> list[PipelineStepDefinition]:
        """返回媒体导入流水线固定步骤定义。"""
        return [
            PipelineStepDefinition(step_name="resolve_external_media", executor=self.resolve_external_media, max_attempts=2),
            PipelineStepDefinition(step_name="download_media", executor=self.download_media, max_attempts=2),
            PipelineStepDefinition(step_name="transcribe_audio", executor=self.transcribe_audio, max_attempts=3),
            PipelineStepDefinition(step_name="enrich_fragment", executor=self.enrich_fragment, max_attempts=2),
            PipelineStepDefinition(step_name="upsert_fragment_vector", executor=self.upsert_fragment_vector, max_attempts=2),
            PipelineStepDefinition(step_name="finalize_fragment", executor=self.finalize_fragment, max_attempts=1),
        ]

    def _runtime_stt_provider(self, context: PipelineExecutionContext):
        """按当前容器状态读取 STT provider，确保测试替身生效。"""
        return context.container.stt_provider

    def _runtime_llm_provider(self, context: PipelineExecutionContext):
        """按当前容器状态读取 LLM provider。"""
        return context.container.llm_provider

    def _runtime_vector_store(self, context: PipelineExecutionContext):
        """按当前容器状态读取向量存储。"""
        return context.container.vector_store

    def _runtime_external_media_provider(self, context: PipelineExecutionContext):
        """按当前容器状态读取外链解析 provider。"""
        return context.container.external_media_provider

    def _runtime_imported_audio_storage(self, context: PipelineExecutionContext):
        """按当前容器状态读取导入音频存储。"""
        return context.container.imported_audio_storage

    async def resolve_external_media(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """解析外链媒体并拿到临时音频文件。"""
        payload = context.input_payload
        if payload.get("source_kind") != "external_link":
            return {"skipped": True}
        external_media_provider = self._runtime_external_media_provider(context)
        if external_media_provider is None:
            raise RuntimeError("external_media_provider is not configured")
        resolved = await external_media_provider.resolve_audio(
            share_url=payload["share_url"],
            platform=payload.get("platform") or "auto",
        )
        return {
            "platform": resolved.platform,
            "share_url": resolved.share_url,
            "media_id": resolved.media_id,
            "title": resolved.title,
            "author": resolved.author,
            "cover_url": resolved.cover_url,
            "content_type": resolved.content_type,
            "local_audio_path": resolved.local_audio_path,
        }

    async def download_media(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """保存外链音频产物，并把路径补写回碎片。"""
        payload = context.input_payload
        if payload.get("source_kind") != "external_link":
            audio_path = payload.get("audio_path")
            return {"audio_path": audio_path}
        imported_audio_storage = self._runtime_imported_audio_storage(context)
        if imported_audio_storage is None:
            raise RuntimeError("imported_audio_storage is not configured")
        resolved = context.get_step_output("resolve_external_media")
        filename = self._build_external_filename(
            platform=resolved["platform"],
            media_id=resolved["media_id"],
            title=resolved.get("title"),
        )
        saved = await imported_audio_storage.save_file(
            source_path=resolved["local_audio_path"],
            user_id=context.run.user_id,
            platform=resolved["platform"],
            filename=filename,
        )
        await self._cleanup_temp(resolved.get("local_audio_path"))
        relative_path = Path(saved["relative_path"]).as_posix()
        fragment_repository.update_audio_path(
            db=context.db,
            fragment_id=payload["fragment_id"],
            user_id=context.run.user_id,
            audio_path=relative_path,
        )
        return {
            "audio_path": relative_path,
            "platform": resolved["platform"],
            "share_url": resolved["share_url"],
            "media_id": resolved["media_id"],
            "title": resolved.get("title"),
            "author": resolved.get("author"),
            "cover_url": resolved.get("cover_url"),
            "content_type": resolved.get("content_type"),
            "audio_public_url": f"/{relative_path}",
        }

    async def transcribe_audio(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """调用 STT 把音频转成文本。"""
        payload = context.input_payload
        audio_path = context.get_step_output("download_media").get("audio_path") or payload.get("audio_path")
        if not audio_path:
            raise RuntimeError("audio path missing for transcription")
        result = await self._runtime_stt_provider(context).transcribe(audio_path)
        transcript = result.text or ""
        normalized_segments = self._normalize_speaker_segments(getattr(result, "speaker_segments", None) or [])
        return {
            "audio_path": audio_path,
            "transcript": transcript,
            "speaker_segments": normalized_segments,
        }

    async def enrich_fragment(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """生成摘要和标签。"""
        transcript = context.get_step_output("transcribe_audio").get("transcript") or ""
        summary, tags = await self._generate_enrichment(
            transcript,
            llm_provider=self._runtime_llm_provider(context),
        )
        return {"summary": summary, "tags": tags}

    async def upsert_fragment_vector(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """将碎片文本写入向量库。"""
        transcript_payload = context.get_step_output("transcribe_audio")
        enrichment_payload = context.get_step_output("enrich_fragment")
        await self._runtime_vector_store(context).upsert_fragment(
            user_id=context.run.user_id,
            fragment_id=context.input_payload["fragment_id"],
            text=transcript_payload.get("transcript") or "",
            source="voice",
            summary=enrichment_payload.get("summary"),
            tags=enrichment_payload.get("tags") or [],
        )
        return {"vectorized": True}

    async def finalize_fragment(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """落库最终转写内容并结束媒体流水线。"""
        transcript_payload = context.get_step_output("transcribe_audio")
        enrichment_payload = context.get_step_output("enrich_fragment")
        audio_payload = context.get_step_output("download_media")
        fragment_id = context.input_payload["fragment_id"]
        fragment_repository.save_transcription_result(
            db=context.db,
            fragment_id=fragment_id,
            user_id=context.run.user_id,
            transcript=transcript_payload.get("transcript") or "",
            summary=enrichment_payload.get("summary"),
            tags_json=json.dumps(enrichment_payload.get("tags") or [], ensure_ascii=False),
            speaker_segments_json=json.dumps(transcript_payload.get("speaker_segments") or [], ensure_ascii=False),
        )
        if audio_payload.get("audio_path"):
            fragment_repository.update_audio_path(
                db=context.db,
                fragment_id=fragment_id,
                user_id=context.run.user_id,
                audio_path=audio_payload["audio_path"],
            )
        return {
            "resource_type": "fragment",
            "resource_id": fragment_id,
            "run_output": {
                "fragment_id": fragment_id,
                "audio_path": audio_payload.get("audio_path") or context.input_payload.get("audio_path"),
                "transcript": transcript_payload.get("transcript"),
                "summary": enrichment_payload.get("summary"),
                "tags": enrichment_payload.get("tags") or [],
            },
        }

    async def _generate_enrichment(self, transcript: str, *, llm_provider) -> tuple[str, list[str]]:
        """生成摘要与标签，并在超时时落回本地策略。"""
        try:
            return await generate_summary_and_tags(
                transcript,
                llm_provider=llm_provider,
                timeout_seconds=ENRICHMENT_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.warning("enrichment_timeout", transcript_length=len(transcript or ""))
            return build_fallback_summary_and_tags(transcript)

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
    def _build_external_filename(*, platform: str, media_id: str, title: str | None) -> str:
        """根据平台和标题构造稳定的文件名。"""
        safe_title = "".join("_" if ch in '\\/:*?"<>|' else ch for ch in (title or "").strip())
        safe_title = " ".join(safe_title.split()).strip(" .")
        stem = safe_title[:80] if safe_title else platform
        if stem == platform:
            return f"{platform}-{media_id}.m4a"
        return f"{stem}-{media_id}.m4a"

    @staticmethod
    async def _cleanup_temp(path_value: str | None) -> None:
        """删除外链导入产生的临时文件。"""
        if not path_value:
            return
        path = Path(path_value)
        try:
            await asyncio.to_thread(path.unlink, missing_ok=True)
        except TypeError:
            if path.exists():
                await asyncio.to_thread(path.unlink)
        try:
            path.parent.rmdir()
        except OSError:
            pass

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


def build_media_ingestion_pipeline_service(container) -> AudioIngestionService:
    """基于容器组装媒体流水线服务。"""
    return AudioIngestionService(
        stt_provider=container.stt_provider,
        llm_provider=container.llm_provider,
        vector_store=container.vector_store,
        pipeline_runner=container.pipeline_runner,
        external_media_provider=container.external_media_provider,
        imported_audio_storage=container.imported_audio_storage,
    )
