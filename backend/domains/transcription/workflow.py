"""Async transcription workflow."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

from domains.fragments import repository as fragment_repository
from models.database import SessionLocal
from services.factory import get_stt_service
from services.llm_service import generate_summary_and_tags

logger = logging.getLogger(__name__)


def mark_fragment_failed(fragment_id: str, user_id: str) -> None:
    with SessionLocal() as db:
        fragment_repository.mark_failed(db=db, fragment_id=fragment_id, user_id=user_id)


def mark_fragment_synced(
    fragment_id: str,
    user_id: str,
    transcript: str,
    summary: Optional[str],
    tags_json: Optional[str],
) -> bool:
    with SessionLocal() as db:
        return fragment_repository.mark_synced(
            db=db,
            fragment_id=fragment_id,
            user_id=user_id,
            transcript=transcript,
            summary=summary,
            tags_json=tags_json,
        )


async def transcribe_with_retry(
    audio_path: str,
    fragment_id: str,
    user_id: str,
    max_retries: int = 2,
) -> dict[str, Any]:
    logger.info("[Transcribe] Start task: fragment_id=%s, audio_path=%s", fragment_id, audio_path)

    try:
        stt_service = get_stt_service()
        retries = 0
        last_error = None

        while retries <= max_retries:
            try:
                logger.info("[Transcribe] Attempt %s", retries + 1)
                result = await stt_service.transcribe(audio_path)
                transcript = result.text

                summary = None
                tags_list: list[str] = []
                tags_json = None

                try:
                    summary, tags_list = await generate_summary_and_tags(transcript)
                    tags_json = json.dumps(tags_list, ensure_ascii=False)
                except Exception as exc:
                    logger.warning("[Transcribe] summary/tags generation failed: %s", str(exc))

                updated = mark_fragment_synced(
                    fragment_id=fragment_id,
                    user_id=user_id,
                    transcript=transcript,
                    summary=summary,
                    tags_json=tags_json,
                )

                if updated:
                    logger.info("[Transcribe] Fragment updated: %s", fragment_id)

                return {
                    "success": True,
                    "fragment_id": fragment_id,
                    "transcript": transcript,
                    "summary": summary,
                    "tags": tags_list,
                }
            except Exception as exc:
                last_error = str(exc)
                retries += 1
                logger.error("[Transcribe] Attempt failed: %s", last_error)
                if retries <= max_retries:
                    wait_time = 2**retries - 1
                    await asyncio.sleep(wait_time)

        mark_fragment_failed(fragment_id=fragment_id, user_id=user_id)
        return {
            "success": False,
            "fragment_id": fragment_id,
            "error": f"转写失败（重试{max_retries}次）: {last_error}",
        }
    except Exception as exc:
        logger.error("[Transcribe] Task crashed: %s", str(exc))
        mark_fragment_failed(fragment_id=fragment_id, user_id=user_id)
        return {
            "success": False,
            "fragment_id": fragment_id,
            "error": f"转写过程异常: {str(exc)}",
        }
