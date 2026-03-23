"""测试辅助对象。"""

from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any

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

    async def delete_fragment(self, *, user_id: str, fragment_id: str):
        """删除内存中的碎片向量文档。"""
        self.fragment_docs.pop(fragment_id, None)
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

    async def upsert_reference_script_chunks(self, *, user_id: str, doc_id: str, chunks):
        """内存存储参考脚本分块。"""
        ref_ids = []
        for chunk_index, chunk_text in chunks:
            ref_id = f"refscript_{doc_id}:chunk_{chunk_index}"
            self.knowledge_docs[ref_id] = {
                "user_id": user_id,
                "doc_id": doc_id,
                "doc_type": "reference_script",
                "chunk_index": chunk_index,
                "content": chunk_text,
            }
            ref_ids.append(ref_id)
        return ref_ids

    async def query_reference_script_chunks(self, *, user_id: str, query_text: str, top_k: int):
        """返回内存中的参考脚本分块检索结果。"""
        if hasattr(self, "reference_script_results"):
            return self.reference_script_results[:top_k]
        return []

    async def delete_reference_script_chunks(self, *, user_id: str, doc_id: str):
        """删除内存中的参考脚本分块。"""
        prefix = f"refscript_{doc_id}:chunk_"
        for key in [k for k in self.knowledge_docs if k.startswith(prefix)]:
            del self.knowledge_docs[key]
        return True

    async def health_check(self):
        return True


class FakeExternalMediaProvider:
    """用于外部媒体导入接口的可编排 provider。"""

    def __init__(self) -> None:
        self.calls: list[dict[str, str]] = []
        self._queued_result: ExternalMediaResolvedAudio | None = None
        self._queued_error: Exception | None = None

    def queue_success(self, resolved_audio: ExternalMediaResolvedAudio) -> None:
        """显式编排下一次解析成功结果。"""
        self._queued_result = resolved_audio
        self._queued_error = None

    def queue_error(self, exc: Exception) -> None:
        """显式编排下一次解析抛出的异常。"""
        self._queued_error = exc
        self._queued_result = None

    async def resolve_audio(self, *, share_url: str, platform: str) -> ExternalMediaResolvedAudio:
        self.calls.append({"share_url": share_url, "platform": platform})
        if self._queued_error is not None:
            raise self._queued_error
        if self._queued_result is not None:
            return self._queued_result
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


class FakeLLMProvider:
    """提供可编排返回的 LLM 替身。"""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self._queued_text = "生成后的口播稿"
        self._queued_error: Exception | None = None

    def queue_text(self, text: str) -> None:
        """显式编排下一次生成返回文本。"""
        self._queued_text = text
        self._queued_error = None

    def queue_error(self, exc: Exception) -> None:
        """显式编排下一次生成抛出异常。"""
        self._queued_error = exc

    async def generate(self, **kwargs: Any) -> str:
        """记录入参并返回编排结果。"""
        self.calls.append(kwargs)
        if self._queued_error is not None:
            raise self._queued_error
        return self._queued_text

    async def health_check(self) -> bool:
        """测试替身默认健康。"""
        return True


class FakeSTTProvider:
    """提供可编排返回的 STT 替身。"""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self._queued_text = "转写完成"
        self._queued_error: Exception | None = None

    def queue_text(self, text: str) -> None:
        """显式编排下一次转写文本。"""
        self._queued_text = text
        self._queued_error = None

    def queue_error(self, exc: Exception) -> None:
        """显式编排下一次转写抛出异常。"""
        self._queued_error = exc

    async def transcribe(self, audio_path: str) -> SimpleNamespace:
        """记录入参并返回编排结果。"""
        self.calls.append(audio_path)
        if self._queued_error is not None:
            raise self._queued_error
        return SimpleNamespace(text=self._queued_text)

    async def health_check(self) -> bool:
        """测试替身默认健康。"""
        return True
