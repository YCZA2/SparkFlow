from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from domains.fragments import repository as fragment_repository
from modules.fragments.content import read_fragment_plain_text
from modules.shared.ports import VectorStore
from utils.serialization import parse_json_list

from .visualization_math import cluster_embeddings, project_embeddings_to_coordinates
from .visualization_payload import build_text_feature_embedding, build_visualization_payload

logger = logging.getLogger(__name__)


async def _backfill_missing_fragment_vectors(
    *,
    db: Session,
    user_id: str,
    vector_store: VectorStore,
    existing_vector_ids: set[str],
) -> int:
    candidates = fragment_repository.list_vectorizable_by_user(db=db, user_id=user_id)
    created_count = 0
    for fragment in candidates:
        effective_text = read_fragment_plain_text(fragment)
        if not effective_text or fragment.id in existing_vector_ids:
            continue

        try:
            await vector_store.upsert_fragment(
                user_id=user_id,
                fragment_id=fragment.id,
                text=effective_text,
                source=fragment.source,
                summary=fragment.summary,
                tags=parse_json_list(fragment.tags, allow_csv_fallback=True),
            )
            existing_vector_ids.add(fragment.id)
            created_count += 1
        except Exception as exc:
            logger.warning(
                "Backfill vector skipped for user=%s fragment=%s: %s",
                user_id,
                fragment.id,
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
    existing_vector_documents = await vector_store.list_fragment_documents(user_id=user_id, include_embeddings=False)
    existing_vector_ids = {document.id for document in existing_vector_documents}

    await _backfill_missing_fragment_vectors(
        db=db,
        user_id=user_id,
        vector_store=vector_store,
        existing_vector_ids=existing_vector_ids,
    )

    vector_documents = await vector_store.list_fragment_documents(user_id=user_id, include_embeddings=True)
    if not vector_documents:
        fallback_fragments = fragment_repository.list_vectorizable_by_user(db=db, user_id=user_id)
        fallback_items = [
            (fragment, build_text_feature_embedding(fragment))
            for fragment in fallback_fragments
            if read_fragment_plain_text(fragment)
        ]
        return build_visualization_payload(items=fallback_items, used_vector_source="fallback_text_features")

    fragments = fragment_repository.get_by_ids(
        db=db,
        user_id=user_id,
        fragment_ids=[document.id for document in vector_documents],
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
        fallback_fragments = fragment_repository.list_vectorizable_by_user(db=db, user_id=user_id)
        fallback_items = [
            (fragment, build_text_feature_embedding(fragment))
            for fragment in fallback_fragments
            if read_fragment_plain_text(fragment)
        ]
        return build_visualization_payload(items=fallback_items, used_vector_source="fallback_text_features")

    return build_visualization_payload(items=valid_items, used_vector_source="vector_store")


__all__ = [
    "build_fragment_visualization",
    "project_embeddings_to_coordinates",
    "cluster_embeddings",
]
