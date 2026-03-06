"""Audio upload and persistence helpers."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import UploadFile
from sqlalchemy.orm import Session

from core.config import settings
from core.exceptions import ValidationError
from domains.fragments import repository as fragment_repository
from models import Fragment

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
MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024


def ensure_upload_dir(user_id: str) -> Path:
    upload_root = Path(settings.UPLOAD_DIR).resolve()
    user_dir = upload_root / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    return user_dir


def get_file_extension(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    if not ext or ext == ".mp4":
        return ".m4a"
    return ext


def validate_audio_file(content_type: Optional[str], filename: str) -> bool:
    ext = get_file_extension(filename)
    if ext in ALLOWED_AUDIO_EXTENSIONS:
        return True
    return bool(content_type and content_type.lower() in ALLOWED_AUDIO_TYPES)


async def save_uploaded_audio(audio: UploadFile, user_id: str) -> dict[str, Any]:
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
    filename = f"{uuid.uuid4()}{ext}"
    user_dir = ensure_upload_dir(user_id)
    file_path = user_dir / filename

    try:
        with open(file_path, "wb") as file_obj:
            file_obj.write(content)
    except Exception as exc:  # pragma: no cover
        raise ValidationError(
            message="保存音频文件失败",
            field_errors={"audio": f"文件写入错误: {str(exc)}"},
        ) from exc

    upload_root = Path(settings.UPLOAD_DIR).resolve()
    relative_path = file_path.relative_to(upload_root.parent)
    return {
        "file_path": str(file_path),
        "relative_path": str(relative_path),
        "file_size": len(content),
    }


def create_fragment_for_transcription(db: Session, user_id: str, relative_path: str) -> Fragment:
    return fragment_repository.create(
        db=db,
        user_id=user_id,
        transcript=None,
        source="voice",
        audio_path=relative_path,
        sync_status="syncing",
    )
