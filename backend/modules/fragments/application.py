from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from models import Fragment
from utils.serialization import format_iso_datetime, parse_json_list, parse_json_object_list

from domains.fragments import repository as fragment_repository
from modules.shared.ports import AudioStorage, VectorStore
from .visualization import build_fragment_visualization

VALID_FRAGMENT_SOURCES = {"voice", "manual", "video_parse"}


def _map_speaker_segments(raw: Optional[str]) -> Optional[list[dict[str, Any]]]:
    parsed = parse_json_object_list(raw)
    if not parsed:
        return None
    normalized: list[dict[str, Any]] = []
    for item in parsed:
        try:
            start_ms = int(item.get("start_ms"))
            end_ms = int(item.get("end_ms"))
        except (TypeError, ValueError):
            continue
        speaker_id = str(item.get("speaker_id") or "").strip()
        text = str(item.get("text") or "").strip()
        if speaker_id and text and end_ms >= start_ms:
            normalized.append({"speaker_id": speaker_id, "start_ms": start_ms, "end_ms": end_ms, "text": text})
    return normalized or None


def map_fragment(fragment: Fragment) -> dict[str, Any]:
    return {
        "id": fragment.id,
        "transcript": fragment.transcript,
        "speaker_segments": _map_speaker_segments(fragment.speaker_segments),
        "summary": fragment.summary,
        "tags": parse_json_list(fragment.tags, allow_csv_fallback=True),
        "source": fragment.source,
        "sync_status": fragment.sync_status,
        "created_at": format_iso_datetime(fragment.created_at),
        "audio_path": fragment.audio_path,
    }


class FragmentCommandService:
    def __init__(self, *, audio_storage: AudioStorage) -> None:
        self.audio_storage = audio_storage

    def create_fragment(
        self,
        *,
        db: Session,
        user_id: str,
        transcript: Optional[str],
        source: str,
        audio_path: Optional[str],
    ) -> Fragment:
        if source not in VALID_FRAGMENT_SOURCES:
            raise ValidationError(
                message="无效的 source 值",
                field_errors={"source": f"必须是以下之一: {', '.join(sorted(VALID_FRAGMENT_SOURCES))}"},
            )
        return fragment_repository.create(
            db=db,
            user_id=user_id,
            transcript=transcript,
            source=source,
            audio_path=audio_path,
            sync_status="synced" if transcript else "pending",
        )

    def delete_fragment(self, *, db: Session, user_id: str, fragment_id: str) -> None:
        fragment = self.get_fragment(db=db, user_id=user_id, fragment_id=fragment_id)
        self.audio_storage.delete(fragment.audio_path)
        fragment_repository.delete(db=db, fragment=fragment)

    def get_fragment(self, *, db: Session, user_id: str, fragment_id: str) -> Fragment:
        fragment = fragment_repository.get_by_id(db=db, user_id=user_id, fragment_id=fragment_id)
        if not fragment:
            raise NotFoundError(
                message="碎片笔记不存在或无权访问",
                resource_type="fragment",
                resource_id=fragment_id,
            )
        return fragment


class FragmentQueryService:
    def __init__(self, *, vector_store: VectorStore) -> None:
        self.vector_store = vector_store

    def list_fragments(self, *, db: Session, user_id: str, limit: int, offset: int) -> dict[str, Any]:
        items = fragment_repository.list_by_user(db=db, user_id=user_id, limit=limit, offset=offset)
        total = fragment_repository.count_by_user(db=db, user_id=user_id)
        return {"items": [map_fragment(item) for item in items], "total": total, "limit": limit, "offset": offset}

    async def query_similar(
        self,
        *,
        db: Session,
        user_id: str,
        query_text: str,
        top_k: int,
        exclude_ids: Optional[list[str]],
    ) -> dict[str, Any]:
        matches = await self.vector_store.query_fragments(
            user_id=user_id,
            query_text=query_text,
            top_k=top_k,
            exclude_ids=exclude_ids,
        )
        fragments = fragment_repository.get_by_ids(
            db=db,
            user_id=user_id,
            fragment_ids=[item["fragment_id"] for item in matches],
        )
        fragment_map = {fragment.id: fragment for fragment in fragments}
        items: list[dict[str, Any]] = []
        for match in matches:
            fragment = fragment_map.get(match["fragment_id"])
            if not fragment:
                continue
            mapped = map_fragment(fragment)
            mapped["score"] = match["score"]
            mapped["metadata"] = match["metadata"]
            items.append(mapped)
        return {"items": items, "total": len(items), "query_text": query_text}

    async def visualization(self, *, db: Session, user_id: str) -> dict[str, Any]:
        return await build_fragment_visualization(db=db, user_id=user_id, vector_store=self.vector_store)
