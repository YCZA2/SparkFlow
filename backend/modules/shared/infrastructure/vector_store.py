from __future__ import annotations

import json
from typing import Any

from core.exceptions import ValidationError
from services.base import VectorDocument

from modules.shared.ports import EmbeddingProvider, KnowledgeChunk, KnowledgeIndexStore, KnowledgeSearchHit, VectorStore

FRAGMENT_NAMESPACE_PREFIX = "fragments"
KNOWLEDGE_NAMESPACE_PREFIX = "knowledge"


def _fragment_namespace(user_id: str) -> str:
    """构造碎片向量命名空间。"""
    return f"{FRAGMENT_NAMESPACE_PREFIX}_{user_id}"


def _knowledge_namespace(user_id: str) -> str:
    """构造知识库向量命名空间。"""
    return f"{KNOWLEDGE_NAMESPACE_PREFIX}_{user_id}"


def _knowledge_doc_prefix(doc_type: str, doc_id: str) -> str:
    """为知识库文档构造分块向量 ID 前缀。"""
    if doc_type == "reference_script":
        return f"refscript_{doc_id}"
    return f"knowdoc_{doc_id}"


class AppVectorStore(VectorStore, KnowledgeIndexStore):
    """封装应用层使用的向量存储适配。"""

    def __init__(self, embedding_provider: EmbeddingProvider, vector_db_provider: Any) -> None:
        """装配向量检索所需的 provider。"""
        self.embedding_provider = embedding_provider
        self.vector_db_provider = vector_db_provider

    async def upsert_fragment(
        self,
        *,
        user_id: str,
        fragment_id: str,
        text: str,
        source: str,
        summary: str | None,
        tags: list[str] | None,
        purpose: str | None = None,
    ) -> bool:
        """把碎片文本写入向量库。"""
        normalized_text = text.strip()
        if not normalized_text:
            raise ValidationError(message="碎片文本不能为空", field_errors={"text": "请输入文本内容"})
        embedding_result = await self.embedding_provider.embed(normalized_text)
        metadata = {"user_id": user_id, "fragment_id": fragment_id, "source": source, "type": "fragment"}
        if summary:
            metadata["summary"] = summary
        if tags:
            metadata["tags_json"] = json.dumps(tags, ensure_ascii=False)
        if purpose:
            metadata["purpose"] = purpose
        return await self.vector_db_provider.upsert(
            namespace=_fragment_namespace(user_id),
            documents=[VectorDocument(id=fragment_id, text=normalized_text, embedding=embedding_result.embedding, metadata=metadata)],
        )

    async def delete_fragment(self, *, user_id: str, fragment_id: str) -> bool:
        """从向量库删除指定碎片文档。"""
        return await self.vector_db_provider.delete(
            namespace=_fragment_namespace(user_id),
            document_ids=[fragment_id],
        )

    async def query_fragments(
        self,
        *,
        user_id: str,
        query_text: str,
        top_k: int,
        exclude_ids: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """按文本查询相关碎片。"""
        normalized_query = query_text.strip()
        if not normalized_query:
            raise ValidationError(message="查询文本不能为空", field_errors={"query_text": "请输入要检索的文本内容"})
        if top_k < 1:
            raise ValidationError(message="top_k 必须大于 0", field_errors={"top_k": "最少返回 1 条结果"})
        namespace = _fragment_namespace(user_id)
        if not await self.vector_db_provider.namespace_exists(namespace):
            return []
        results = await self.vector_db_provider.query_by_text(
            namespace=namespace,
            query_text=normalized_query,
            embedding_service=self.embedding_provider,
            top_k=max(top_k * 3, top_k + len(exclude_ids or [])),
        )
        excluded = set(exclude_ids or [])
        filtered: list[dict[str, Any]] = []
        for result in results:
            if result.id in excluded:
                continue
            filtered.append(
                {
                    "fragment_id": result.id,
                    "transcript": result.text,
                    "score": result.score,
                    "metadata": result.metadata or {},
                }
            )
            if len(filtered) >= top_k:
                break
        return filtered

    async def list_fragment_documents(self, *, user_id: str, include_embeddings: bool = True) -> list[Any]:
        """返回当前用户碎片向量文档列表。"""
        return await self.vector_db_provider.list_documents(
            namespace=_fragment_namespace(user_id),
            include_embeddings=include_embeddings,
        )

    async def index_document(
        self,
        *,
        user_id: str,
        doc_id: str,
        title: str,
        doc_type: str,
        chunks: list[KnowledgeChunk],
    ) -> str | None:
        """把知识库文档分块写入向量库。"""
        normalized_title = title.strip()
        if not normalized_title:
            raise ValidationError(message="知识库标题不能为空", field_errors={"title": "请输入标题"})
        valid_chunks = [chunk for chunk in chunks if chunk.content.strip()]
        if not valid_chunks:
            raise ValidationError(message="知识库内容不能为空", field_errors={"content": "请输入内容"})
        ref_prefix = _knowledge_doc_prefix(doc_type, doc_id)
        # 批量嵌入减少 API 调用次数（相比逐块调用 embed()）
        contents = [chunk.content.strip() for chunk in valid_chunks]
        embedding_results = await self.embedding_provider.embed_batch(contents)
        if len(embedding_results) != len(valid_chunks) or any(result is None for result in embedding_results):
            raise RuntimeError("知识库向量化失败，存在未成功生成 embedding 的分块")
        documents: list[VectorDocument] = [
            VectorDocument(
                id=f"{ref_prefix}:chunk_{chunk.chunk_index}",
                text=content,
                embedding=result.embedding,
                metadata={
                    "user_id": user_id,
                    "doc_id": doc_id,
                    "title": normalized_title,
                    "doc_type": doc_type,
                    "chunk_index": chunk.chunk_index,
                },
            )
            for chunk, content, result in zip(valid_chunks, contents, embedding_results)
        ]
        await self.vector_db_provider.upsert(namespace=_knowledge_namespace(user_id), documents=documents)
        return documents[0].id if documents else None

    async def search(
        self,
        *,
        user_id: str,
        query_text: str,
        top_k: int,
        doc_types: list[str] | None = None,
    ) -> list[KnowledgeSearchHit]:
        """按文本查询相关知识库文档，并聚合为文档级结果。"""
        normalized_query = query_text.strip()
        if not normalized_query:
            raise ValidationError(message="查询文本不能为空", field_errors={"query_text": "请输入要检索的文本内容"})
        if top_k < 1:
            raise ValidationError(message="top_k 必须大于 0", field_errors={"top_k": "最少返回 1 条结果"})
        namespace = _knowledge_namespace(user_id)
        if not await self.vector_db_provider.namespace_exists(namespace):
            return []
        results = await self.vector_db_provider.query_by_text(
            namespace=namespace,
            query_text=normalized_query,
            embedding_service=self.embedding_provider,
            top_k=max(top_k * 4, 12),
        )
        allowed_doc_types = set(doc_types or [])
        aggregated: dict[str, KnowledgeSearchHit] = {}
        for result in results:
            metadata = result.metadata or {}
            doc_id = metadata.get("doc_id")
            doc_type = metadata.get("doc_type")
            if not doc_id or not doc_type:
                continue
            if allowed_doc_types and doc_type not in allowed_doc_types:
                continue
            matched_chunk = result.text.strip()
            existing = aggregated.get(doc_id)
            if existing is None:
                aggregated[doc_id] = KnowledgeSearchHit(
                    doc_id=doc_id,
                    title=metadata.get("title") or "",
                    doc_type=doc_type,
                    score=float(result.score),
                    chunk_count=1,
                    matched_chunks=[matched_chunk] if matched_chunk else [],
                )
                continue
            existing.score = max(existing.score, float(result.score))
            existing.chunk_count += 1
            if matched_chunk and existing.matched_chunks is not None and matched_chunk not in existing.matched_chunks:
                existing.matched_chunks.append(matched_chunk)
        ranked = sorted(aggregated.values(), key=lambda item: item.score, reverse=True)
        return ranked[:top_k]

    async def search_reference_examples(
        self,
        *,
        user_id: str,
        query_text: str,
        top_k: int,
    ) -> list[KnowledgeSearchHit]:
        """按文本检索 reference_script 分块，并保留 chunk 级示例内容。"""
        hits = await self.search(
            user_id=user_id,
            query_text=query_text,
            top_k=top_k,
            doc_types=["reference_script"],
        )
        return hits

    async def delete_document(self, *, user_id: str, doc_id: str) -> bool:
        """删除某知识库文档的全部分块向量。"""
        namespace = _knowledge_namespace(user_id)
        if not await self.vector_db_provider.namespace_exists(namespace):
            return True
        all_docs = await self.vector_db_provider.list_documents(namespace=namespace, include_embeddings=False)
        chunk_ids = []
        for doc in all_docs:
            metadata = doc.metadata or {}
            if metadata.get("doc_id") == doc_id:
                chunk_ids.append(doc.id)
        if not chunk_ids:
            return True
        return await self.vector_db_provider.delete(namespace=namespace, document_ids=chunk_ids)

    async def refresh_document(
        self,
        *,
        user_id: str,
        doc_id: str,
        title: str,
        doc_type: str,
        chunks: list[KnowledgeChunk],
    ) -> str | None:
        """删除旧索引并重建知识库文档分块索引。"""
        await self.delete_document(user_id=user_id, doc_id=doc_id)
        return await self.index_document(user_id=user_id, doc_id=doc_id, title=title, doc_type=doc_type, chunks=chunks)

    async def health_check(self) -> bool:
        """检查向量服务健康状态。"""
        return await self.vector_db_provider.health_check()


def create_vector_store(*, embedding_provider: EmbeddingProvider, vector_db_provider: Any) -> AppVectorStore:
    """构造应用级向量存储适配器。"""
    return AppVectorStore(embedding_provider=embedding_provider, vector_db_provider=vector_db_provider)
