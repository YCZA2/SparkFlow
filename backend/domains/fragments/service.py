"""Fragment domain service."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from models import Fragment
from services.vector_service import query_similar_fragments as query_similar_fragments_from_vector_db
from services.vector_visualization_service import build_fragment_visualization
from utils.serialization import format_iso_datetime, parse_json_list

from . import repository

VALID_FRAGMENT_SOURCES = {"voice", "manual", "video_parse"}


def _parse_tags(tags_raw: Optional[str]) -> Optional[list[str]]:
    return parse_json_list(tags_raw, allow_csv_fallback=True)


def serialize_fragment(fragment: Fragment, include_audio_path: bool = True) -> dict[str, Any]:
    data = {
        "id": fragment.id,
        "transcript": fragment.transcript,
        "summary": fragment.summary,
        "tags": _parse_tags(fragment.tags),
        "source": fragment.source,
        "sync_status": fragment.sync_status,
        "created_at": format_iso_datetime(fragment.created_at),
        "audio_path": fragment.audio_path,
    }
    if not include_audio_path:
        data.pop("audio_path", None)
    return data


def serialize_transcribe_status(fragment: Fragment) -> dict[str, Any]:
    data = serialize_fragment(fragment, include_audio_path=True)
    data["fragment_id"] = data.pop("id")
    return data


def list_fragments(db: Session, user_id: str, limit: int, offset: int) -> list[Fragment]:
    return repository.list_by_user(db=db, user_id=user_id, limit=limit, offset=offset)


def count_fragments(db: Session, user_id: str) -> int:
    return repository.count_by_user(db=db, user_id=user_id)


def get_fragment_or_raise(db: Session, user_id: str, fragment_id: str) -> Fragment:
    fragment = repository.get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
    if not fragment:
        raise NotFoundError(
            message="碎片笔记不存在或无权访问",
            resource_type="fragment",
            resource_id=fragment_id,
        )
    return fragment


def create_fragment(
    db: Session,
    user_id: str,
    transcript: Optional[str],
    source: str,
    audio_path: Optional[str],
) -> Fragment:
    if source not in VALID_FRAGMENT_SOURCES:
        sources_display = ", ".join(sorted(VALID_FRAGMENT_SOURCES))
        raise ValidationError(
            message=f"无效的 source 值，必须是以下之一: {sources_display}",
            field_errors={"source": f"必须是以下之一: {sources_display}"},
        )

    return repository.create(
        db=db,
        user_id=user_id,
        transcript=transcript,
        source=source,
        audio_path=audio_path,
        sync_status="synced" if transcript else "pending",
    )


def delete_fragment(db: Session, user_id: str, fragment_id: str) -> None:
    fragment = get_fragment_or_raise(db=db, user_id=user_id, fragment_id=fragment_id)
    repository.delete(db=db, fragment=fragment)


async def query_similar_fragments(
    db: Session,
    user_id: str,
    query_text: str,
    top_k: int = 5,
    exclude_ids: Optional[list[str]] = None,
) -> list[dict[str, Any]]:
    results = await query_similar_fragments_from_vector_db(
        user_id=user_id,
        query_text=query_text,
        top_k=top_k,
        exclude_ids=exclude_ids,
    )
    if not results:
        return []

    fragments = repository.get_by_ids(
        db=db,
        user_id=user_id,
        fragment_ids=[item["fragment_id"] for item in results],
    )
    fragments_by_id = {fragment.id: fragment for fragment in fragments}

    payload: list[dict[str, Any]] = []
    for item in results:
        fragment = fragments_by_id.get(item["fragment_id"])
        if not fragment:
            continue

        payload.append(
            {
                **serialize_fragment(fragment, include_audio_path=False),
                "score": item["score"],
                "metadata": item["metadata"],
            }
        )

    return payload


async def get_fragment_visualization(db: Session, user_id: str) -> dict[str, Any]:
    return await build_fragment_visualization(db=db, user_id=user_id)
