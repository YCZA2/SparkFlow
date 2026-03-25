from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from modules.shared.fragment_snapshots import FragmentSnapshotReader, read_fragment_snapshot_text
from modules.shared.ports import VectorStore

from .visualization_math import cluster_embeddings, project_embeddings_to_coordinates
from .visualization_payload import build_text_feature_embedding, build_visualization_payload

logger = logging.getLogger(__name__)
_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


async def _backfill_missing_fragment_vectors(
    *,
    db: Session,
    user_id: str,
    vector_store: VectorStore,
    existing_vector_ids: set[str],
) -> int:
    candidates = _FRAGMENT_SNAPSHOT_READER.list_vectorizable_by_user(db=db, user_id=user_id)
    created_count = 0
    for snapshot in candidates:
        effective_text = read_fragment_snapshot_text(snapshot)
        if not effective_text or snapshot.id in existing_vector_ids:
            continue

        try:
            await vector_store.upsert_fragment(
                user_id=user_id,
                fragment_id=snapshot.id,
                text=effective_text,
                source=snapshot.source,
                summary=snapshot.summary,
                tags=snapshot.tags,
            )
            existing_vector_ids.add(snapshot.id)
            created_count += 1
        except Exception as exc:
            logger.warning(
                "Backfill vector skipped for user=%s fragment=%s: %s",
                user_id,
                snapshot.id,
                str(exc),
            )
            break
    return created_count


async def build_fragment_visualization(
    *,
    db: Session,
    user_id: str,
    vector_store: VectorStore,
) -> dict[str, Any]:
    deleted_ids = set(_FRAGMENT_SNAPSHOT_READER.list_deleted_ids(db=db, user_id=user_id))
    for fragment_id in deleted_ids:
        try:
            await vector_store.delete_fragment(user_id=user_id, fragment_id=fragment_id)
        except Exception as exc:
            logger.warning("Delete stale vector skipped for user=%s fragment=%s: %s", user_id, fragment_id, str(exc))

    existing_vector_documents = await vector_store.list_fragment_documents(user_id=user_id, include_embeddings=False)
    existing_vector_ids = {document.id for document in existing_vector_documents if document.id not in deleted_ids}

    await _backfill_missing_fragment_vectors(
        db=db,
        user_id=user_id,
        vector_store=vector_store,
        existing_vector_ids=existing_vector_ids,
    )

    vector_documents = await vector_store.list_fragment_documents(user_id=user_id, include_embeddings=True)
    if not vector_documents:
        fallback_fragments = _FRAGMENT_SNAPSHOT_READER.list_vectorizable_by_user(db=db, user_id=user_id)
        fallback_items = [
            (fragment, build_text_feature_embedding(fragment))
            for fragment in fallback_fragments
            if read_fragment_snapshot_text(fragment)
        ]
        return build_visualization_payload(items=fallback_items, used_vector_source="fallback_text_features")

    fragments = _FRAGMENT_SNAPSHOT_READER.get_by_ids(
        db=db,
        user_id=user_id,
        fragment_ids=[document.id for document in vector_documents if document.id not in deleted_ids],
    )
    fragments_by_id = {fragment.id: fragment for fragment in fragments}

    valid_items: list[tuple[Any, list[float]]] = []
    for document in vector_documents:
        fragment = fragments_by_id.get(document.id)
        if not fragment:
            continue
        if not getattr(document, "embedding", None):
            logger.warning("Skipping fragment %s because embedding is missing", document.id)
            continue
        valid_items.append((fragment, [float(value) for value in document.embedding]))

    if not valid_items:
        fallback_fragments = _FRAGMENT_SNAPSHOT_READER.list_vectorizable_by_user(db=db, user_id=user_id)
        fallback_items = [
            (fragment, build_text_feature_embedding(fragment))
            for fragment in fallback_fragments
            if read_fragment_snapshot_text(fragment)
        ]
        return build_visualization_payload(items=fallback_items, used_vector_source="fallback_text_features")

    return build_visualization_payload(items=valid_items, used_vector_source="vector_store")


__all__ = [
    "build_fragment_visualization",
    "project_embeddings_to_coordinates",
    "cluster_embeddings",
]
