"""测试辅助对象。"""

from __future__ import annotations

from modules.shared.ports import ExternalMediaResolvedAudio, WebSearchResult


class FakeVectorStore:
    """提供碎片与知识库向量操作的内存替身。"""

    def __init__(self) -> None:
        self.fragment_docs: dict[str, dict] = {}
        self.knowledge_docs: dict[str, dict] = {}
        self.knowledge_results: list[dict] = []

    async def upsert_fragment(self, *, user_id: str, fragment_id: str, text: str, source: str, summary, tags):
        self.fragment_docs[fragment_id] = {
            "user_id": user_id,
            "fragment_id": fragment_id,
            "text": text,
            "source": source,
            "summary": summary,
            "tags": tags or [],
        }
        return True

    async def query_fragments(self, *, user_id: str, query_text: str, top_k: int, exclude_ids=None):
        excluded = set(exclude_ids or [])
        items = [
            {
                "fragment_id": fragment_id,
                "score": 0.95 if query_text in payload["text"] else 0.8,
                "metadata": {"source": payload["source"]},
            }
            for fragment_id, payload in self.fragment_docs.items()
            if payload["user_id"] == user_id and fragment_id not in excluded
        ]
        return items[:top_k]

    async def list_fragment_documents(self, *, user_id: str, include_embeddings: bool = True):
        return []

    async def upsert_knowledge_doc(self, *, user_id: str, doc_id: str, title: str, content: str, doc_type: str):
        vector_ref_id = f"knowledge_{user_id}:{doc_id}"
        self.knowledge_docs[doc_id] = {
            "user_id": user_id,
            "title": title,
            "content": content,
            "doc_type": doc_type,
            "vector_ref_id": vector_ref_id,
        }
        return vector_ref_id

    async def query_knowledge_docs(self, *, user_id: str, query_text: str, top_k: int):
        if self.knowledge_results:
            return self.knowledge_results[:top_k]
        items = [
            {"doc_id": doc_id, "score": 0.9, "content": payload["content"], "metadata": {"title": payload["title"]}}
            for doc_id, payload in self.knowledge_docs.items()
            if payload["user_id"] == user_id and query_text in payload["content"]
        ]
        return items[:top_k]

    async def delete_knowledge_doc(self, *, user_id: str, doc_id: str):
        self.knowledge_docs.pop(doc_id, None)
        return True

    async def health_check(self):
        return True


class FakeExternalMediaProvider:
    """用于外部媒体导入接口的可编排 provider。"""

    def __init__(self) -> None:
        self.next_result: ExternalMediaResolvedAudio | None = None
        self.next_error: Exception | None = None

    async def resolve_audio(self, *, share_url: str, platform: str) -> ExternalMediaResolvedAudio:
        if self.next_error is not None:
            raise self.next_error
        if self.next_result is not None:
            return self.next_result
        raise RuntimeError("fake external media provider not configured")

    async def health_check(self) -> bool:
        return True


class FakeWebSearchProvider:
    """记录查询词并返回固定结果的 Web 搜索替身。"""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def search(self, *, query_text: str, top_k: int):
        self.calls.append(query_text)
        return [WebSearchResult(title="A", url="https://example.com", snippet="snippet")][:top_k]
