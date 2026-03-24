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


@dataclass
class KnowledgeChunk:
    """描述知识库文档的标准化分块结果。"""

    chunk_index: int
    content: str


@dataclass
class KnowledgeSearchHit:
    """描述知识库检索返回的文档级聚合命中。"""

    doc_id: str
    title: str
    doc_type: str
    score: float
    chunk_count: int = 0
    matched_chunks: list[str] | None = None


class KnowledgeIndexStore(Protocol):
    async def index_document(
        self,
        *,
        user_id: str,
        doc_id: str,
        title: str,
        doc_type: str,
        chunks: list[KnowledgeChunk],
    ) -> str | None: ...
    async def delete_document(self, *, user_id: str, doc_id: str) -> bool: ...
    async def search(
        self,
        *,
        user_id: str,
        query_text: str,
        top_k: int,
        doc_types: list[str] | None = None,
    ) -> list[KnowledgeSearchHit]: ...
    async def search_reference_examples(
        self,
        *,
        user_id: str,
        query_text: str,
        top_k: int,
    ) -> list[KnowledgeSearchHit]: ...
    async def refresh_document(
        self,
        *,
        user_id: str,
        doc_id: str,
        title: str,
        doc_type: str,
        chunks: list[KnowledgeChunk],
    ) -> str | None: ...
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
    async def delete_fragment(self, *, user_id: str, fragment_id: str) -> bool: ...
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
    async def upsert_reference_script_chunks(
        self,
        *,
        user_id: str,
        doc_id: str,
        chunks: list[tuple[int, str]],
    ) -> list[str]: ...
    async def query_reference_script_chunks(
        self,
        *,
        user_id: str,
        query_text: str,
        top_k: int,
    ) -> list[dict[str, Any]]: ...
    async def delete_reference_script_chunks(self, *, user_id: str, doc_id: str) -> bool: ...
    async def health_check(self) -> bool: ...


StorageProvider = Literal["local", "oss"]
StorageAccessLevel = Literal["private"]


@dataclass
class StoredFile:
    """描述已持久化文件的统一元数据。"""

    storage_provider: StorageProvider
    bucket: str
    object_key: str
    access_level: StorageAccessLevel
    original_filename: str
    mime_type: str
    file_size: int
    checksum: str | None = None


@dataclass
class FileAccess:
    """描述文件访问地址及过期时间。"""

    url: str
    expires_at: str | None = None


@dataclass
class MaterializedFile:
    """描述被物化到本地磁盘的文件句柄。"""

    local_path: Path
    cleanup: Any


class FileStorage(Protocol):
    async def save_upload(
        self,
        *,
        file: UploadFile,
        object_key: str,
        original_filename: str,
        mime_type: str,
        access_level: StorageAccessLevel = "private",
    ) -> StoredFile: ...

    async def save_local_file(
        self,
        *,
        source_path: str,
        object_key: str,
        original_filename: str,
        mime_type: str,
        access_level: StorageAccessLevel = "private",
    ) -> StoredFile: ...

    def delete(self, stored_file: StoredFile | None) -> None: ...
    def create_download_url(self, stored_file: StoredFile) -> FileAccess: ...
    def materialize(self, stored_file: StoredFile) -> MaterializedFile: ...
    def read_bytes(self, stored_file: StoredFile) -> bytes: ...


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
    """描述一次外挂工作流提交或查询返回的统一结构。"""

    run_id: str
    status: WorkflowRunStatus
    outputs: dict[str, Any]
    raw_payload: dict[str, Any]
    provider_run_id: str | None = None
    provider_workflow_id: str | None = None
    provider_task_id: str | None = None


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
    """外挂工作流 provider 协议。"""

    # 中文注释：submit_run 只负责创建远端运行并返回句柄，最终结果统一通过 get_run 查询。
    async def submit_run(self, *, inputs: dict[str, Any], user_id: str) -> WorkflowProviderRun: ...
    async def get_run(self, *, run_id: str) -> WorkflowProviderRun: ...
    async def aclose(self) -> None: ...
