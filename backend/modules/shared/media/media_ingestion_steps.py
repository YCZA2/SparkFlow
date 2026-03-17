from __future__ import annotations

import asyncio
import mimetypes
from pathlib import Path
from typing import Any

from core.exceptions import AppException, ValidationError
from core.logging_config import get_logger
from modules.shared.enrichment import build_fallback_summary_and_tags, generate_summary_and_tags
from sqlalchemy.orm import Session

from domains.fragment_folders import repository as fragment_folder_repository
from modules.shared.pipeline.pipeline_runtime import PipelineExecutionContext, PipelineExecutionError, PipelineStepDefinition

from modules.shared.media.media_ingestion_persistence import MediaIngestionPersistenceService
from modules.shared.ports import ExternalMediaProvider
from modules.shared.infrastructure.storage import build_imported_audio_object_key, sanitize_filename
from modules.shared.media.stored_file_payloads import stored_file_from_payload, stored_file_to_payload

logger = get_logger(__name__)
DEFAULT_ENRICHMENT_TIMEOUT_SECONDS = 45.0


class MediaIngestionStepExecutor:
    """封装媒体导入 pipeline 的步骤执行逻辑。"""

    def __init__(self, *, persistence_service: MediaIngestionPersistenceService) -> None:
        """装配媒体导入步骤依赖。"""
        self.persistence_service = persistence_service

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

    def _runtime_external_media_provider(self, context: PipelineExecutionContext) -> ExternalMediaProvider | None:
        """按当前容器状态读取外链解析 provider。"""
        return context.container.external_media_provider

    def _runtime_file_storage(self, context: PipelineExecutionContext):
        """按当前容器状态读取文件存储实现。"""
        return context.container.file_storage

    def _runtime_stt_provider(self, context: PipelineExecutionContext):
        """按当前容器状态读取 STT provider。"""
        return context.container.stt_provider

    def _runtime_llm_provider(self, context: PipelineExecutionContext):
        """按当前容器状态读取 LLM provider。"""
        return context.container.llm_provider

    def _runtime_vector_store(self, context: PipelineExecutionContext):
        """按当前容器状态读取向量存储。"""
        return context.container.vector_store

    async def resolve_external_media(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """解析外链媒体并拿到临时音频文件。"""
        payload = context.input_payload
        if payload.get("source_kind") != "external_link":
            return {"skipped": True}
        if payload.get("audio_file"):
            return {"skipped": True, **(payload.get("source_context") or {})}
        external_media_provider = self._runtime_external_media_provider(context)
        if external_media_provider is None:
            raise RuntimeError("external_media_provider is not configured")
        try:
            resolved = await external_media_provider.resolve_audio(
                share_url=payload["share_url"],
                platform=payload.get("platform") or "auto",
            )
        except Exception as exc:
            raise self.wrap_external_media_error(exc, fallback_message="外链解析失败") from exc
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
        """保存外链音频产物，并把对象元数据补写回碎片。"""
        payload = context.input_payload
        if payload.get("source_kind") != "external_link":
            return {"audio_file": payload.get("audio_file")}
        if payload.get("audio_file"):
            return {
                "audio_file": payload.get("audio_file"),
                **(payload.get("source_context") or {}),
            }
        file_storage = self._runtime_file_storage(context)
        resolved = context.get_step_output("resolve_external_media")
        filename = self.build_external_filename(
            platform=resolved["platform"],
            media_id=resolved["media_id"],
            title=resolved.get("title"),
        )
        mime_type = mimetypes.guess_type(filename)[0] or "audio/m4a"
        object_key = build_imported_audio_object_key(
            user_id=context.run.user_id,
            fragment_id=payload.get("fragment_id") or payload.get("local_fragment_id") or "local-fragment",
            platform=resolved["platform"],
            filename=filename,
        )
        try:
            saved = await file_storage.save_local_file(
                source_path=resolved["local_audio_path"],
                object_key=object_key,
                original_filename=filename,
                mime_type=mime_type,
            )
        except Exception as exc:
            raise PipelineExecutionError(
                f"媒体音频保存失败: {str(exc) or 'unknown error'}",
                retryable=True,
            ) from exc
        finally:
            await self.cleanup_temp(resolved.get("local_audio_path"))
        self.persistence_service.update_fragment_audio_file(
            db=context.db,
            fragment_id=payload["fragment_id"],
            user_id=context.run.user_id,
            saved=saved,
        )
        access = file_storage.create_download_url(saved)
        return {
            "audio_file": stored_file_to_payload(saved),
            "platform": resolved["platform"],
            "share_url": resolved["share_url"],
            "media_id": resolved["media_id"],
            "title": resolved.get("title"),
            "author": resolved.get("author"),
            "cover_url": resolved.get("cover_url"),
            "content_type": resolved.get("content_type"),
            "audio_file_url": access.url,
            "audio_file_expires_at": access.expires_at,
        }

    async def transcribe_audio(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """调用 STT 把音频转成文本。"""
        payload = context.input_payload
        stored_file = stored_file_from_payload(context.get_step_output("download_media").get("audio_file") or payload.get("audio_file"))
        if stored_file is None:
            raise RuntimeError("audio file missing for transcription")
        file_storage = self._runtime_file_storage(context)
        materialized = file_storage.materialize(stored_file)
        try:
            try:
                result = await self._runtime_stt_provider(context).transcribe(str(materialized.local_path))
            except asyncio.CancelledError as exc:
                raise PipelineExecutionError("语音转写被取消", retryable=False) from exc
            except Exception as exc:
                raise PipelineExecutionError(
                    f"语音转写失败: {str(exc) or 'unknown error'}",
                    retryable=True,
                ) from exc
        finally:
            materialized.cleanup()
        transcript = result.text or ""
        normalized_segments = self.normalize_speaker_segments(getattr(result, "speaker_segments", None) or [])
        return {
            "audio_file": stored_file_to_payload(stored_file),
            "transcript": transcript,
            "speaker_segments": normalized_segments,
        }

    async def enrich_fragment(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """生成摘要和标签。"""
        transcript = context.get_step_output("transcribe_audio").get("transcript") or ""
        try:
            summary, tags = await self.generate_enrichment(
                transcript,
                llm_provider=self._runtime_llm_provider(context),
            )
        except Exception as exc:
            raise PipelineExecutionError(
                f"摘要增强失败: {str(exc) or 'unknown error'}",
                retryable=True,
            ) from exc
        return {"summary": summary, "tags": tags}

    async def upsert_fragment_vector(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """将碎片文本写入向量库。"""
        transcript_payload = context.get_step_output("transcribe_audio")
        enrichment_payload = context.get_step_output("enrich_fragment")
        target_fragment_id = (
            context.input_payload.get("fragment_id")
            or context.input_payload.get("local_fragment_id")
        )
        if not target_fragment_id:
            raise PipelineExecutionError("缺少可向量化的 fragment 标识", retryable=False)
        try:
            await self._runtime_vector_store(context).upsert_fragment(
                user_id=context.run.user_id,
                fragment_id=target_fragment_id,
                text=transcript_payload.get("transcript") or "",
                source="voice",
                summary=enrichment_payload.get("summary"),
                tags=enrichment_payload.get("tags") or [],
            )
        except Exception as exc:
            raise PipelineExecutionError(
                f"碎片向量写入失败: {str(exc) or 'unknown error'}",
                retryable=True,
            ) from exc
        return {"vectorized": True}

    async def finalize_fragment(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """落库最终转写内容并结束媒体流水线。"""
        transcript_payload = context.get_step_output("transcribe_audio")
        enrichment_payload = context.get_step_output("enrich_fragment")
        audio_payload = context.get_step_output("download_media")
        self.persistence_service.save_transcription_result(
            db=context.db,
            fragment_id=context.input_payload["fragment_id"],
            user_id=context.run.user_id,
            transcript=transcript_payload.get("transcript") or "",
            summary=enrichment_payload.get("summary"),
            tags=enrichment_payload.get("tags") or [],
            speaker_segments=transcript_payload.get("speaker_segments") or [],
        )
        return self.persistence_service.build_finalize_payload(
            file_storage=self._runtime_file_storage(context),
            input_payload=context.input_payload,
            audio_payload=audio_payload,
            transcript_payload=transcript_payload,
            enrichment_payload=enrichment_payload,
        )

    async def generate_enrichment(self, transcript: str, *, llm_provider) -> tuple[str, list[str]]:
        """生成摘要与标签，并在超时时落回本地策略。"""
        import modules.shared.media.audio_ingestion as audio_ingestion_module

        try:
            return await generate_summary_and_tags(
                transcript,
                llm_provider=llm_provider,
                timeout_seconds=audio_ingestion_module.ENRICHMENT_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.warning("enrichment_timeout", transcript_length=len(transcript or ""))
            return build_fallback_summary_and_tags(transcript)

    @staticmethod
    def normalize_speaker_segments(speaker_segments: list[Any]) -> list[dict[str, Any]]:
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
    def build_external_filename(*, platform: str, media_id: str, title: str | None) -> str:
        """根据平台和标题构造稳定的文件名。"""
        stem = sanitize_filename(title or platform, platform)
        if stem == platform:
            return f"{platform}-{media_id}.m4a"
        return f"{stem}-{media_id}.m4a"

    @staticmethod
    async def cleanup_temp(path_value: str | None) -> None:
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
    def validate_folder_exists(db: Session, user_id: str, folder_id: str | None) -> None:
        """校验目标文件夹存在且属于当前用户。"""
        if folder_id is None:
            return
        folder = fragment_folder_repository.get_by_id(db=db, user_id=user_id, folder_id=folder_id)
        if not folder:
            from core.exceptions import NotFoundError

            raise NotFoundError(
                message="文件夹不存在或无权访问",
                resource_type="fragment_folder",
                resource_id=folder_id,
            )

    @staticmethod
    def validate_audio_source(audio_source: str) -> None:
        """校验允许的音频来源枚举。"""
        if audio_source not in {"upload", "external_link"}:
            raise ValidationError(
                message="无效的 audio_source 值",
                field_errors={"audio_source": "必须是 upload 或 external_link"},
            )

    @staticmethod
    def wrap_external_media_error(exc: Exception, *, fallback_message: str) -> PipelineExecutionError:
        """将外链导入异常映射为带重试语义的流水线错误。"""
        if isinstance(exc, PipelineExecutionError):
            return exc
        if isinstance(exc, ValidationError):
            return PipelineExecutionError(str(exc), retryable=False)
        if isinstance(exc, AppException):
            retryable = exc.status_code >= 500
            return PipelineExecutionError(exc.message or fallback_message, retryable=retryable)
        return PipelineExecutionError(f"{fallback_message}: {str(exc) or 'unknown error'}", retryable=True)
