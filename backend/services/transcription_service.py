"""Transcription domain service.

将转写相关的业务逻辑从路由层迁移到服务层，包含：
- 音频文件校验与保存
- 碎片记录创建
- 带重试的转写流程
- 转写后摘要与标签生成
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import UploadFile
from sqlalchemy.orm import Session

from core.config import settings
from core.exceptions import ValidationError
from models import Fragment
from models.database import SessionLocal
from services.factory import get_stt_service
from services.llm_service import generate_summary_and_tags

logger = logging.getLogger(__name__)

ALLOWED_AUDIO_TYPES = {
    "audio/m4a",
    "audio/mp4",
    "audio/x-m4a",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/aac",
    "audio/ogg",
    "audio/opus",
    "application/octet-stream",
}

ALLOWED_AUDIO_EXTENSIONS = {".m4a", ".wav", ".mp3", ".aac", ".ogg", ".opus"}
MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024  # 50MB


def ensure_upload_dir(user_id: str) -> Path:
    """Ensure per-user upload directory exists."""
    upload_root = Path(settings.UPLOAD_DIR).resolve()
    user_dir = upload_root / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    return user_dir


def get_file_extension(filename: str) -> str:
    """Resolve extension from original filename."""
    ext = Path(filename).suffix.lower()
    if not ext or ext == ".mp4":
        return ".m4a"
    return ext


def validate_audio_file(content_type: Optional[str], filename: str) -> bool:
    """Validate file by extension or MIME type."""
    ext = get_file_extension(filename)
    if ext in ALLOWED_AUDIO_EXTENSIONS:
        return True

    if content_type and content_type.lower() in ALLOWED_AUDIO_TYPES:
        return True

    return False


async def save_uploaded_audio(audio: UploadFile, user_id: str) -> dict[str, Any]:
    """Persist uploaded audio file to local storage."""
    if not validate_audio_file(audio.content_type, audio.filename or ""):
        raise ValidationError(
            message="不支持的音频文件格式",
            field_errors={
                "audio": (
                    "支持的格式: .m4a, .wav, .mp3, .aac。"
                    f"当前: {audio.content_type or audio.filename}"
                )
            },
        )

    content = await audio.read()
    if len(content) > MAX_AUDIO_FILE_SIZE:
        raise ValidationError(
            message="音频文件过大",
            field_errors={"audio": "音频文件大小不能超过 50MB"},
        )

    ext = get_file_extension(audio.filename or "")
    file_id = str(uuid.uuid4())
    filename = f"{file_id}{ext}"

    user_dir = ensure_upload_dir(user_id)
    file_path = user_dir / filename

    try:
        with open(file_path, "wb") as f:
            f.write(content)
    except Exception as exc:  # pragma: no cover - OS level failure
        raise ValidationError(
            message="保存音频文件失败",
            field_errors={"audio": f"文件写入错误: {str(exc)}"},
        ) from exc

    upload_root = Path(settings.UPLOAD_DIR)
    if not upload_root.is_absolute():
        upload_root = Path.cwd() / upload_root
    relative_path = file_path.relative_to(upload_root.parent)

    return {
        "file_path": str(file_path),
        "relative_path": str(relative_path),
        "file_size": len(content),
    }


def create_fragment_for_transcription(db: Session, user_id: str, relative_path: str) -> Fragment:
    """Create a fragment row in syncing state before async transcription."""
    fragment = Fragment(
        user_id=user_id,
        audio_path=relative_path,
        source="voice",
        sync_status="syncing",
    )
    db.add(fragment)
    db.commit()
    db.refresh(fragment)
    return fragment


def _mark_fragment_failed(db: Session, fragment_id: str, user_id: str) -> None:
    fragment = (
        db.query(Fragment)
        .filter(Fragment.id == fragment_id, Fragment.user_id == user_id)
        .first()
    )
    if fragment:
        fragment.sync_status = "failed"
        db.commit()


def _mark_fragment_synced(
    db: Session,
    fragment_id: str,
    user_id: str,
    transcript: str,
    summary: Optional[str],
    tags_json: Optional[str],
) -> bool:
    fragment = (
        db.query(Fragment)
        .filter(Fragment.id == fragment_id, Fragment.user_id == user_id)
        .first()
    )
    if not fragment:
        return False

    fragment.transcript = transcript
    fragment.summary = summary
    fragment.tags = tags_json
    fragment.sync_status = "synced"
    db.commit()
    return True


async def transcribe_with_retry(
    audio_path: str,
    fragment_id: str,
    user_id: str,
    max_retries: int = 2,
) -> dict[str, Any]:
    """Run async STT with retry and update fragment status."""
    db = SessionLocal()
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

                updated = _mark_fragment_synced(
                    db=db,
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

        _mark_fragment_failed(db, fragment_id, user_id)
        return {
            "success": False,
            "fragment_id": fragment_id,
            "error": f"转写失败（重试{max_retries}次）: {last_error}",
        }
    except Exception as exc:
        logger.error("[Transcribe] Task crashed: %s", str(exc))
        _mark_fragment_failed(db, fragment_id, user_id)
        return {
            "success": False,
            "fragment_id": fragment_id,
            "error": f"转写过程异常: {str(exc)}",
        }
    finally:
        db.close()
