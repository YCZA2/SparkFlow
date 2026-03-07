from __future__ import annotations

from pathlib import Path
from typing import Any, Optional, Protocol

from fastapi import UploadFile


class SpeechToTextProvider(Protocol):
    async def transcribe(self, audio_path: str) -> Any: ...
    async def health_check(self) -> bool: ...


class TextGenerationProvider(Protocol):
    async def generate(
        self,
        *,
        system_prompt: str,
        user_message: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> str: ...
    async def health_check(self) -> bool: ...


class EmbeddingProvider(Protocol):
    async def embed(self, text: str) -> Any: ...
    async def health_check(self) -> bool: ...


class VectorStore(Protocol):
    async def upsert_fragment(
        self,
        *,
        user_id: str,
        fragment_id: str,
        text: str,
        source: str,
        summary: Optional[str],
        tags: Optional[list[str]],
    ) -> bool: ...
    async def query_fragments(
        self,
        *,
        user_id: str,
        query_text: str,
        top_k: int,
        exclude_ids: Optional[list[str]] = None,
    ) -> list[dict[str, Any]]: ...
    async def list_fragment_documents(
        self,
        *,
        user_id: str,
        include_embeddings: bool = True,
    ) -> list[Any]: ...
    async def upsert_knowledge_doc(
        self,
        *,
        user_id: str,
        doc_id: str,
        title: str,
        content: str,
        doc_type: str,
    ) -> str: ...
    async def query_knowledge_docs(
        self,
        *,
        user_id: str,
        query_text: str,
        top_k: int,
    ) -> list[dict[str, Any]]: ...
    async def delete_knowledge_doc(self, *, user_id: str, doc_id: str) -> bool: ...
    async def health_check(self) -> bool: ...


class AudioStorage(Protocol):
    async def save(self, *, audio: UploadFile, user_id: str) -> dict[str, Any]: ...
    def delete(self, audio_path: Optional[str]) -> None: ...
    def resolve_path(self, audio_path: str) -> Path: ...


class JobRunner(Protocol):
    def schedule(self, task: Any, /, *args: Any, **kwargs: Any) -> None: ...
