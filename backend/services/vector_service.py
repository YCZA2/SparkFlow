"""High-level helpers for fragment vectorization workflows."""

from __future__ import annotations

import json
from typing import Optional

from core.exceptions import ValidationError

from .base import VectorDocument
from .factory import get_embedding_service, get_vector_db_service

FRAGMENT_NAMESPACE_PREFIX = "fragments"


def build_fragment_namespace(user_id: str) -> str:
    """Return the Chroma collection name used for a user's fragments."""
    return f"{FRAGMENT_NAMESPACE_PREFIX}_{user_id}"


async def upsert_fragment(
    *,
    user_id: str,
    fragment_id: str,
    text: str,
    source: str = "voice",
    summary: Optional[str] = None,
    tags: Optional[list[str]] = None,
) -> bool:
    """Embed a fragment transcript and store it in the vector database."""
    normalized_text = text.strip()
    if not normalized_text:
        raise ValueError("碎片文本不能为空")

    embedding_service = get_embedding_service()
    vector_db_service = get_vector_db_service()
    embedding_result = await embedding_service.embed(normalized_text)

    metadata = {
        "user_id": user_id,
        "fragment_id": fragment_id,
        "source": source,
        "type": "fragment",
    }
    if summary:
        metadata["summary"] = summary
    if tags:
        metadata["tags_json"] = json.dumps(tags, ensure_ascii=False)

    namespace = build_fragment_namespace(user_id)
    document = VectorDocument(
        id=fragment_id,
        text=normalized_text,
        embedding=embedding_result.embedding,
        metadata=metadata,
    )
    return await vector_db_service.upsert(namespace=namespace, documents=[document])


async def query_similar_fragments(
    *,
    user_id: str,
    query_text: str,
    top_k: int = 5,
    exclude_ids: Optional[list[str]] = None,
) -> list[dict]:
    """Query semantically similar fragments from the user's vector namespace."""
    normalized_query = query_text.strip()
    if not normalized_query:
        raise ValidationError(
            message="查询文本不能为空",
            field_errors={"query_text": "请输入要检索的文本内容"},
        )

    if top_k < 1:
        raise ValidationError(
            message="top_k 必须大于 0",
            field_errors={"top_k": "最少返回 1 条结果"},
        )

    exclude_ids = list(dict.fromkeys(exclude_ids or []))
    namespace = build_fragment_namespace(user_id)
    vector_db_service = get_vector_db_service()

    if not await vector_db_service.namespace_exists(namespace):
        return []

    query_limit = max(top_k + len(exclude_ids), top_k * 3)
    embedding_service = get_embedding_service()
    results = await vector_db_service.query_by_text(
        namespace=namespace,
        query_text=normalized_query,
        embedding_service=embedding_service,
        top_k=query_limit,
    )

    filtered_results: list[dict] = []
    excluded_id_set = set(exclude_ids)
    for result in results:
        if result.id in excluded_id_set:
            continue

        filtered_results.append(
            {
                "fragment_id": result.id,
                "transcript": result.text,
                "score": result.score,
                "metadata": result.metadata or {},
            }
        )
        if len(filtered_results) >= top_k:
            break

    return filtered_results
