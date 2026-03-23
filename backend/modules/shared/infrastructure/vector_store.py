from __future__ import annotations

import json
from typing import Any

from core.exceptions import ValidationError
from services.base import VectorDocument

from modules.shared.ports import EmbeddingProvider, VectorStore

FRAGMENT_NAMESPACE_PREFIX = "fragments"
KNOWLEDGE_NAMESPACE_PREFIX = "knowledge"


def _fragment_namespace(user_id: str) -> str:
    """构造碎片向量命名空间。"""
    return f"{FRAGMENT_NAMESPACE_PREFIX}_{user_id}"


def _knowledge_namespace(user_id: str) -> str:
    """构造知识库向量命名空间。"""
    return f"{KNOWLEDGE_NAMESPACE_PREFIX}_{user_id}"


class AppVectorStore(VectorStore):
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

    async def upsert_knowledge_doc(
        self,
        *,
        user_id: str,
        doc_id: str,
        title: str,
        content: str,
        doc_type: str,
    ) -> str:
        """把知识库文档写入向量库。"""
        normalized_title = title.strip()
        normalized_content = content.strip()
        if not normalized_title:
            raise ValidationError(message="知识库标题不能为空", field_errors={"title": "请输入标题"})
        if not normalized_content:
            raise ValidationError(message="知识库内容不能为空", field_errors={"content": "请输入内容"})
        embedding_result = await self.embedding_provider.embed(normalized_content)
        ref_id = f"docs_{user_id}:{doc_id}"
        await self.vector_db_provider.upsert(
            namespace=_knowledge_namespace(user_id),
            documents=[
                VectorDocument(
                    id=ref_id,
                    text=normalized_content,
                    embedding=embedding_result.embedding,
                    metadata={"user_id": user_id, "doc_id": doc_id, "title": normalized_title, "doc_type": doc_type},
                )
            ],
        )
        return ref_id

    async def query_knowledge_docs(self, *, user_id: str, query_text: str, top_k: int) -> list[dict[str, Any]]:
        """按文本查询相关知识库文档。"""
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
            top_k=top_k,
        )
        items: list[dict[str, Any]] = []
        for result in results:
            metadata = result.metadata or {}
            items.append(
                {
                    "doc_id": metadata.get("doc_id"),
                    "title": metadata.get("title"),
                    "doc_type": metadata.get("doc_type"),
                    "score": result.score,
                    "content": result.text,
                }
            )
        return items

    async def delete_knowledge_doc(self, *, user_id: str, doc_id: str) -> bool:
        """删除知识库向量文档。"""
        ref_id = f"docs_{user_id}:{doc_id}"
        return await self.vector_db_provider.delete(namespace=_knowledge_namespace(user_id), doc_ids=[ref_id])

    async def upsert_reference_script_chunks(
        self,
        *,
        user_id: str,
        doc_id: str,
        chunks: list[tuple[int, str]],
    ) -> list[str]:
        """把参考脚本的分块写入向量库，每块单独存储以支持细粒度检索。

        ID 格式为 refscript_{doc_id}:chunk_{n}，metadata 携带 doc_type=reference_script
        以便后续按类型过滤，与知识库其他文档共用同一命名空间。
        """
        if not chunks:
            return []
        namespace = _knowledge_namespace(user_id)
        ref_ids: list[str] = []
        documents = []
        for chunk_index, chunk_text in chunks:
            normalized = chunk_text.strip()
            if not normalized:
                continue
            embedding_result = await self.embedding_provider.embed(normalized)
            ref_id = f"refscript_{doc_id}:chunk_{chunk_index}"
            ref_ids.append(ref_id)
            documents.append(
                VectorDocument(
                    id=ref_id,
                    text=normalized,
                    embedding=embedding_result.embedding,
                    metadata={
                        "user_id": user_id,
                        "doc_id": doc_id,
                        "doc_type": "reference_script",
                        "chunk_index": chunk_index,
                    },
                )
            )
        if documents:
            await self.vector_db_provider.upsert(namespace=namespace, documents=documents)
        return ref_ids

    async def query_reference_script_chunks(
        self,
        *,
        user_id: str,
        query_text: str,
        top_k: int,
    ) -> list[dict[str, Any]]:
        """按文本检索参考脚本分块，通过 doc_type 元数据过滤只返回 reference_script 类型。

        返回 [{doc_id, chunk_index, content, score}]，供下游提取风格描述和示例。
        """
        normalized_query = query_text.strip()
        if not normalized_query:
            return []
        namespace = _knowledge_namespace(user_id)
        if not await self.vector_db_provider.namespace_exists(namespace):
            return []
        results = await self.vector_db_provider.query_by_text(
            namespace=namespace,
            query_text=normalized_query,
            embedding_service=self.embedding_provider,
            top_k=top_k,
            filter_metadata={"doc_type": {"$eq": "reference_script"}},
        )
        items: list[dict[str, Any]] = []
        for result in results:
            metadata = result.metadata or {}
            items.append(
                {
                    "doc_id": metadata.get("doc_id"),
                    "chunk_index": metadata.get("chunk_index"),
                    "content": result.text,
                    "score": result.score,
                }
            )
        return items

    async def delete_reference_script_chunks(self, *, user_id: str, doc_id: str) -> bool:
        """删除某参考脚本的全部分块向量。

        通过 ID 前缀 refscript_{doc_id}: 过滤，批量删除该文档的所有向量块。
        """
        namespace = _knowledge_namespace(user_id)
        if not await self.vector_db_provider.namespace_exists(namespace):
            return True
        all_docs = await self.vector_db_provider.list_documents(namespace=namespace, include_embeddings=False)
        prefix = f"refscript_{doc_id}:chunk_"
        chunk_ids = [doc.id for doc in all_docs if doc.id.startswith(prefix)]
        if not chunk_ids:
            return True
        return await self.vector_db_provider.delete(namespace=namespace, document_ids=chunk_ids)

    async def health_check(self) -> bool:
        """检查向量服务健康状态。"""
        return await self.vector_db_provider.health_check()


def create_vector_store(*, embedding_provider: EmbeddingProvider, vector_db_provider: Any) -> AppVectorStore:
    """构造应用级向量存储适配器。"""
    return AppVectorStore(embedding_provider=embedding_provider, vector_db_provider=vector_db_provider)
