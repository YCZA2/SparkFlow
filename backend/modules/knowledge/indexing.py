from __future__ import annotations

from modules.shared.ports import KnowledgeChunk, KnowledgeIndexStore, KnowledgeSearchHit


class KnowledgeIndexingService:
    """封装知识库索引操作，便于后续替换底层 RAG 引擎。"""

    def __init__(self, *, store: KnowledgeIndexStore) -> None:
        """装配知识索引读写依赖。"""
        self.store = store

    async def index_document(
        self,
        *,
        user_id: str,
        doc_id: str,
        title: str,
        doc_type: str,
        chunks: list[KnowledgeChunk],
    ) -> str | None:
        """首次写入知识库文档索引。"""
        return await self.store.index_document(
            user_id=user_id,
            doc_id=doc_id,
            title=title,
            doc_type=doc_type,
            chunks=chunks,
        )

    async def refresh_document(
        self,
        *,
        user_id: str,
        doc_id: str,
        title: str,
        doc_type: str,
        chunks: list[KnowledgeChunk],
    ) -> str | None:
        """重建知识库文档索引。"""
        return await self.store.refresh_document(
            user_id=user_id,
            doc_id=doc_id,
            title=title,
            doc_type=doc_type,
            chunks=chunks,
        )

    async def delete_document(self, *, user_id: str, doc_id: str) -> bool:
        """删除知识库文档索引。"""
        return await self.store.delete_document(user_id=user_id, doc_id=doc_id)

    async def search(
        self,
        *,
        user_id: str,
        query_text: str,
        top_k: int,
        doc_types: list[str] | None = None,
    ) -> list[KnowledgeSearchHit]:
        """执行文档级聚合检索。"""
        return await self.store.search(user_id=user_id, query_text=query_text, top_k=top_k, doc_types=doc_types)

    async def search_reference_examples(
        self,
        *,
        user_id: str,
        query_text: str,
        top_k: int,
    ) -> list[KnowledgeSearchHit]:
        """检索参考脚本示例块。"""
        return await self.store.search_reference_examples(user_id=user_id, query_text=query_text, top_k=top_k)
