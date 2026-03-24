from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from domains.knowledge import repository as knowledge_repository
from modules.shared.ports import KnowledgeIndexStore


@dataclass
class KnowledgeGenerationContext:
    """描述脚本生成时可消费的知识库上下文。"""

    style_description: str = ""
    reference_examples: list[str] = field(default_factory=list)
    high_like_examples: list[str] = field(default_factory=list)
    language_habit_examples: list[str] = field(default_factory=list)


async def build_knowledge_generation_context(
    *,
    db: Session,
    user_id: str,
    query_text: str,
    knowledge_index_store: KnowledgeIndexStore,
) -> KnowledgeGenerationContext:
    """按查询词聚合三类知识文档，供脚本生成提示词使用。"""
    context = KnowledgeGenerationContext()

    # 三类知识检索相互独立，并发执行以降低延迟
    reference_hits, high_like_hits, language_hits = await asyncio.gather(
        knowledge_index_store.search_reference_examples(user_id=user_id, query_text=query_text, top_k=3),
        knowledge_index_store.search(user_id=user_id, query_text=query_text, top_k=2, doc_types=["high_likes"]),
        knowledge_index_store.search(user_id=user_id, query_text=query_text, top_k=2, doc_types=["language_habit"]),
    )

    if reference_hits:
        top_doc_id = reference_hits[0].doc_id
        doc = knowledge_repository.get_by_id(db=db, user_id=user_id, doc_id=top_doc_id)
        if doc and doc.style_description:
            context.style_description = doc.style_description
        for hit in reference_hits:
            for chunk in hit.matched_chunks or []:
                if chunk and chunk not in context.reference_examples:
                    context.reference_examples.append(chunk)

    for hit in high_like_hits:
        for chunk in hit.matched_chunks or []:
            if chunk and chunk not in context.high_like_examples:
                context.high_like_examples.append(chunk)

    for hit in language_hits:
        for chunk in hit.matched_chunks or []:
            if chunk and chunk not in context.language_habit_examples:
                context.language_habit_examples.append(chunk)

    return context
