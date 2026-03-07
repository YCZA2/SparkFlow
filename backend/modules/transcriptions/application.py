from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import UploadFile
from sqlalchemy.orm import Session

from core.exceptions import ServiceUnavailableError
from domains.fragments import repository as fragment_repository
from models import Fragment
from modules.fragments.application import map_fragment
from modules.shared.ports import AudioStorage, SpeechToTextProvider, TextGenerationProvider, VectorStore
from services.llm_service import generate_summary_and_tags

logger = logging.getLogger(__name__)


class TranscriptionUseCase:
    def __init__(
        self,
        *,
        audio_storage: AudioStorage,
        stt_provider: SpeechToTextProvider,
        llm_provider: TextGenerationProvider,
        vector_store: VectorStore,
    ) -> None:
        self.audio_storage = audio_storage
        self.stt_provider = stt_provider
        self.llm_provider = llm_provider
        self.vector_store = vector_store

    async def upload_audio(
        self,
        *,
        db: Session,
        user_id: str,
        audio: UploadFile,
    ) -> dict[str, Any]:
        try:
            is_available = await self.stt_provider.health_check()
            if not is_available:
                raise RuntimeError("health check returned unavailable")
        except Exception as exc:
            raise ServiceUnavailableError(
                message=f"语音转写服务暂时不可用: {str(exc)}",
                service_name="stt",
            ) from exc

        saved = await self.audio_storage.save(audio=audio, user_id=user_id)
        fragment = fragment_repository.create(
            db=db,
            user_id=user_id,
            transcript=None,
            source="voice",
            audio_path=saved["relative_path"],
            sync_status="syncing",
        )
        return {
            "fragment_id": fragment.id,
            "audio_path": saved["file_path"],
            "relative_path": saved["relative_path"],
            "file_size": saved["file_size"],
            "duration": None,
            "sync_status": "syncing",
        }

    def get_status(self, *, db: Session, user_id: str, fragment_id: str) -> dict[str, Any]:
        fragment = fragment_repository.get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
        if not fragment:
            from core.exceptions import NotFoundError
            raise NotFoundError(message="碎片笔记不存在或无权访问", resource_type="fragment", resource_id=fragment_id)
        payload = map_fragment(fragment)
        payload["fragment_id"] = payload.pop("id")
        return payload

    async def process_transcription(
        self,
        *,
        fragment_id: str,
        user_id: str,
        audio_path: str,
        session_factory,
        max_retries: int = 2,
    ) -> dict[str, Any]:
        last_error: str | None = None
        for attempt in range(max_retries + 1):
            try:
                result = await self.stt_provider.transcribe(audio_path)
                transcript = result.text
                summary, tags = await generate_summary_and_tags(transcript, llm_service=self.llm_provider)
                speaker_segments = getattr(result, "speaker_segments", None) or []
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
                with session_factory() as db:
                    updated = fragment_repository.mark_synced(
                        db=db,
                        fragment_id=fragment_id,
                        user_id=user_id,
                        transcript=transcript,
                        summary=summary,
                        tags_json=json.dumps(tags, ensure_ascii=False),
                        speaker_segments_json=json.dumps(normalized_segments, ensure_ascii=False) if normalized_segments else None,
                    )
                if updated:
                    try:
                        await self.vector_store.upsert_fragment(
                            user_id=user_id,
                            fragment_id=fragment_id,
                            text=transcript,
                            source="voice",
                            summary=summary,
                            tags=tags,
                        )
                    except Exception:
                        logger.warning("vectorization failed for fragment %s", fragment_id, exc_info=True)
                return {"success": True, "fragment_id": fragment_id, "transcript": transcript}
            except Exception as exc:
                last_error = str(exc)
                logger.error("transcription attempt failed for fragment %s: %s", fragment_id, last_error)
                if attempt < max_retries:
                    await asyncio.sleep((2 ** (attempt + 1)) - 1)
        with session_factory() as db:
            fragment_repository.mark_failed(db=db, fragment_id=fragment_id, user_id=user_id)
        return {"success": False, "fragment_id": fragment_id, "error": last_error}
