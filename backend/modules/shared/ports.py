from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Optional, Protocol

from fastapi import UploadFile

from core.exceptions import ServiceUnavailableError, ValidationError


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


@dataclass
class ExternalMediaResolvedAudio:
    platform: str
    share_url: str
    media_id: str
    title: str | None
    author: str | None
    cover_url: str | None
    content_type: str
    local_audio_path: str


class ImportedAudioStorage(Protocol):
    async def save_file(self, *, source_path: str, user_id: str, platform: str, filename: str) -> dict[str, Any]: ...
    def delete(self, audio_path: Optional[str]) -> None: ...
    def resolve_path(self, audio_path: str) -> Path: ...


class MediaAssetStorage(Protocol):
    async def save(self, *, file: UploadFile, user_id: str, media_kind: str) -> dict[str, Any]: ...
    def delete(self, storage_path: Optional[str]) -> None: ...
    def resolve_path(self, storage_path: str) -> Path: ...


class ExternalMediaProvider(Protocol):
    async def resolve_audio(self, *, share_url: str, platform: str) -> ExternalMediaResolvedAudio: ...
    async def health_check(self) -> bool: ...


class JobRunner(Protocol):
    def schedule(self, task: Any, /, *args: Any, **kwargs: Any) -> None: ...


@dataclass
class WebSearchResult:
    title: str
    url: str
    snippet: str


class WebSearchProvider(Protocol):
    async def search(self, *, query_text: str, top_k: int) -> list[WebSearchResult]: ...


WorkflowRunStatus = Literal["queued", "running", "succeeded", "failed"]


@dataclass
class WorkflowProviderRun:
    run_id: str
    status: WorkflowRunStatus
    outputs: dict[str, Any]
    raw_payload: dict[str, Any]
    provider_run_id: str | None = None
    provider_workflow_id: str | None = None


class WorkflowProviderRequestError(ValidationError):
    """标记外挂工作流请求参数或调用方式错误。"""

    def __init__(self, *, provider_name: str, message: str, field_errors: Optional[dict[str, str]] = None) -> None:
        # 中文注释：对外仍复用 422 语义，便于业务层按请求错误处理。
        super().__init__(message=message, field_errors=field_errors or {provider_name: message})


class WorkflowProviderUpstreamError(ServiceUnavailableError):
    """标记外挂工作流上游服务失败。"""

    def __init__(self, *, provider_name: str, message: str) -> None:
        super().__init__(message=message, service_name=provider_name)


class WorkflowProviderTimeoutError(ServiceUnavailableError):
    """标记外挂工作流请求超时或暂时不可用。"""

    def __init__(self, *, provider_name: str, message: str) -> None:
        super().__init__(message=message, service_name=provider_name)


class WorkflowProviderInvalidResponseError(ServiceUnavailableError):
    """标记外挂工作流返回了无效结构。"""

    def __init__(self, *, provider_name: str, message: str) -> None:
        super().__init__(message=message, service_name=provider_name)


class WorkflowProvider(Protocol):
    async def submit_run(self, *, inputs: dict[str, Any], user_id: str) -> WorkflowProviderRun: ...
    async def get_run(self, *, run_id: str) -> WorkflowProviderRun: ...
    async def aclose(self) -> None: ...
