"""AppVectorStore 行为测试。"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from modules.shared.infrastructure.vector_store import AppVectorStore
from modules.shared.ports import KnowledgeChunk


class _FakeEmbeddingProvider:
    """提供可编排批量 embedding 结果的替身。"""

    def __init__(self, results):
        self.results = results

    async def embed_batch(self, texts):
        return self.results


class _FakeVectorDbProvider:
    """记录是否发生 upsert 的最小向量库替身。"""

    def __init__(self) -> None:
        self.upsert_calls = []

    async def upsert(self, *, namespace, documents):
        self.upsert_calls.append({"namespace": namespace, "documents": documents})
        return True


@pytest.mark.asyncio
async def test_index_document_fails_when_any_embedding_result_is_missing() -> None:
    """知识库分块 embedding 只要有缺失，就应整体失败而不是部分成功。"""
    embedding_provider = _FakeEmbeddingProvider(
        [
            SimpleNamespace(embedding=[0.1, 0.2]),
            None,
        ]
    )
    vector_db_provider = _FakeVectorDbProvider()
    store = AppVectorStore(embedding_provider=embedding_provider, vector_db_provider=vector_db_provider)

    with pytest.raises(RuntimeError, match="embedding"):
        await store.index_document(
            user_id="test-user-001",
            doc_id="doc-001",
            title="知识文档",
            doc_type="high_likes",
            chunks=[
                KnowledgeChunk(chunk_index=0, content="第一段"),
                KnowledgeChunk(chunk_index=1, content="第二段"),
            ],
        )

    assert vector_db_provider.upsert_calls == []
