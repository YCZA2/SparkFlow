from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path
from typing import Any, Optional

from fastapi import BackgroundTasks, UploadFile

from core.config import Settings
from core.exceptions import ServiceUnavailableError, ValidationError
from services.base import VectorDocument
from services.dify_workflow_provider import DifyWorkflowProvider
from services.external_media import ExternalMediaService

from .ports import (
    AudioStorage,
    EmbeddingProvider,
    ExternalMediaProvider,
    ImportedAudioStorage,
    JobRunner,
    MediaAssetStorage,
    VectorStore,
    WebSearchProvider,
    WebSearchResult,
    WorkflowProvider,
)

FRAGMENT_NAMESPACE_PREFIX = "fragments"
KNOWLEDGE_NAMESPACE_PREFIX = "knowledge"
ALLOWED_AUDIO_TYPES = {
    "audio/m4a",
    "audio/mp4",
    "audio/x-m4a",
    "audio/wav",
    "audio/wave",
    "audio/x-wav",
    "audio/mpeg",
    "audio/mp3",
    "audio/aac",
    "audio/ogg",
    "audio/opus",
    "application/octet-stream",
}
ALLOWED_AUDIO_EXTENSIONS = {".m4a", ".wav", ".mp3", ".aac", ".ogg", ".opus"}
MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024
ALLOWED_MEDIA_EXTENSIONS = {
    "image": {".png", ".jpg", ".jpeg", ".gif", ".webp"},
    "audio": ALLOWED_AUDIO_EXTENSIONS,
    "file": {".txt", ".md", ".docx", ".pdf"},
}


def _fragment_namespace(user_id: str) -> str:
    """构造碎片向量命名空间。"""
    return f"{FRAGMENT_NAMESPACE_PREFIX}_{user_id}"


def _knowledge_namespace(user_id: str) -> str:
    """构造知识库向量命名空间。"""
    return f"{KNOWLEDGE_NAMESPACE_PREFIX}_{user_id}"


class LocalAudioStorage(AudioStorage):
    """提供本地文件系统音频存储。"""

    def __init__(self, upload_dir: str) -> None:
        """记录音频上传根目录。"""
        self.upload_dir = Path(upload_dir).resolve()

    @staticmethod
    def _file_extension(filename: str) -> str:
        """归一化上传文件扩展名。"""
        ext = Path(filename).suffix.lower()
        if not ext or ext == ".mp4":
            return ".m4a"
        return ext

    def _ensure_dir(self, user_id: str) -> Path:
        """确保用户上传目录存在。"""
        user_dir = self.upload_dir / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir

    async def save(self, *, audio: UploadFile, user_id: str) -> dict[str, Any]:
        """校验并保存上传音频文件。"""
        ext = self._file_extension(audio.filename or "")
        if ext not in ALLOWED_AUDIO_EXTENSIONS and (audio.content_type or "").lower() not in ALLOWED_AUDIO_TYPES:
            raise ValidationError(
                message="不支持的音频文件格式",
                field_errors={"audio": "支持 .m4a、.wav、.mp3、.aac、.ogg、.opus"},
            )

        content = await audio.read()
        if len(content) > MAX_AUDIO_FILE_SIZE:
            raise ValidationError(
                message="音频文件过大",
                field_errors={"audio": "音频文件大小不能超过 50MB"},
            )

        filename = f"{Path(audio.filename or 'recording').stem}-{len(content)}{ext}"
        destination = self._ensure_dir(user_id) / filename
        suffix = 1
        while destination.exists():
            destination = self._ensure_dir(user_id) / f"{Path(filename).stem}-{suffix}{ext}"
            suffix += 1

        destination.write_bytes(content)
        relative_path = destination.relative_to(self.upload_dir.parent)
        return {
            "file_path": str(destination),
            "relative_path": str(relative_path),
            "file_size": len(content),
        }

    def resolve_path(self, audio_path: str) -> Path:
        """把相对音频路径解析为绝对路径。"""
        raw_path = Path(audio_path)
        if raw_path.is_absolute():
            return raw_path
        return (self.upload_dir.parent / raw_path).resolve()

    def delete(self, audio_path: Optional[str]) -> None:
        """删除指定的本地音频文件。"""
        if not audio_path:
            return
        candidate = self.resolve_path(audio_path)
        if candidate.exists():
            candidate.unlink()


class FastApiBackgroundJobRunner(JobRunner):
    """把后台任务挂到 FastAPI BackgroundTasks。"""

    def __init__(self, background_tasks: BackgroundTasks) -> None:
        """保存 FastAPI 后台任务对象。"""
        self.background_tasks = background_tasks

    def schedule(self, task: Any, /, *args: Any, **kwargs: Any) -> None:
        """把任务转交给 FastAPI 处理。"""
        self.background_tasks.add_task(task, *args, **kwargs)


class LocalImportedAudioStorage(ImportedAudioStorage):
    """提供外链导入音频的本地落盘能力。"""

    def __init__(self, upload_dir: str) -> None:
        """记录导入音频根目录。"""
        self.upload_dir = Path(upload_dir).resolve()

    @staticmethod
    def _sanitize_stem(value: str) -> str:
        """清洗文件名 stem，避免非法字符。"""
        sanitized = "".join("_" if ch in '\\/:*?"<>|' else ch for ch in (value or "").strip())
        sanitized = " ".join(sanitized.split()).strip(" .")
        return sanitized[:80] or "audio"

    def _ensure_dir(self, user_id: str, platform: str) -> Path:
        """确保外链导入目录存在。"""
        destination = self.upload_dir / "external_media" / user_id / platform
        destination.mkdir(parents=True, exist_ok=True)
        return destination

    async def save_file(self, *, source_path: str, user_id: str, platform: str, filename: str) -> dict[str, Any]:
        """复制外链下载音频到正式存储目录。"""
        source = Path(source_path).resolve()
        if not source.exists():
            raise ValidationError(message="导入音频文件不存在", field_errors={"audio": "外部媒体下载结果无效"})

        ext = source.suffix.lower() or ".m4a"
        if ext != ".m4a":
            ext = ".m4a"
        destination_dir = self._ensure_dir(user_id, platform)
        destination = destination_dir / f"{self._sanitize_stem(Path(filename).stem)}{ext}"
        suffix = 1
        while destination.exists():
            destination = destination_dir / f"{self._sanitize_stem(Path(filename).stem)}-{suffix}{ext}"
            suffix += 1

        shutil.copy2(source, destination)
        relative_path = destination.relative_to(self.upload_dir.parent)
        return {
            "file_path": str(destination),
            "relative_path": str(relative_path),
            "file_size": destination.stat().st_size,
        }

    def resolve_path(self, audio_path: str) -> Path:
        """把相对导入音频路径解析为绝对路径。"""
        raw_path = Path(audio_path)
        if raw_path.is_absolute():
            return raw_path
        return (self.upload_dir.parent / raw_path).resolve()

    def delete(self, audio_path: Optional[str]) -> None:
        """删除指定的导入音频文件。"""
        if not audio_path:
            return
        candidate = self.resolve_path(audio_path)
        if candidate.exists():
            candidate.unlink()


class LocalMediaAssetStorage(MediaAssetStorage):
    """提供统一媒体资源的本地落盘能力。"""

    def __init__(self, upload_dir: str) -> None:
        """记录媒体资源根目录。"""
        self.upload_dir = Path(upload_dir).resolve()

    def _ensure_dir(self, user_id: str, media_kind: str) -> Path:
        """确保媒体资源目录存在。"""
        destination = self.upload_dir / "media_assets" / user_id / media_kind
        destination.mkdir(parents=True, exist_ok=True)
        return destination

    def resolve_path(self, storage_path: str) -> Path:
        """把相对媒体路径解析为绝对路径。"""
        raw_path = Path(storage_path)
        if raw_path.is_absolute():
            return raw_path
        return (self.upload_dir.parent / raw_path).resolve()

    def delete(self, storage_path: Optional[str]) -> None:
        """删除指定媒体文件。"""
        if not storage_path:
            return
        candidate = self.resolve_path(storage_path)
        if candidate.exists():
            candidate.unlink()

    async def save(self, *, file: UploadFile, user_id: str, media_kind: str) -> dict[str, Any]:
        """校验并保存通用媒体文件。"""
        normalized_kind = media_kind if media_kind in ALLOWED_MEDIA_EXTENSIONS else "file"
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALLOWED_MEDIA_EXTENSIONS[normalized_kind]:
            raise ValidationError(
                message="不支持的媒体文件格式",
                field_errors={"file": f"{normalized_kind} 类型暂不支持该扩展名"},
            )
        content = await file.read()
        if not content:
            raise ValidationError(message="上传文件为空", field_errors={"file": "请选择有效文件"})
        destination_dir = self._ensure_dir(user_id, normalized_kind)
        digest = hashlib.sha256(content).hexdigest()
        stem = Path(file.filename or normalized_kind).stem[:80] or normalized_kind
        destination = destination_dir / f"{stem}-{digest[:12]}{ext}"
        destination.write_bytes(content)
        relative_path = destination.relative_to(self.upload_dir.parent)
        return {
            "file_path": str(destination),
            "relative_path": str(relative_path),
            "file_size": len(content),
            "checksum": digest,
            "mime_type": (file.content_type or "application/octet-stream").lower(),
            "original_filename": file.filename or destination.name,
        }


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
        summary: Optional[str],
        tags: Optional[list[str]],
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

    async def query_fragments(
        self,
        *,
        user_id: str,
        query_text: str,
        top_k: int,
        exclude_ids: Optional[list[str]] = None,
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
        normalized = content.strip()
        if not normalized:
            raise ValidationError(message="知识库文档内容不能为空", field_errors={"content": "请输入文档内容"})
        embedding_result = await self.embedding_provider.embed(normalized)
        vector_ref_id = f"{_knowledge_namespace(user_id)}:{doc_id}"
        metadata = {"user_id": user_id, "doc_id": doc_id, "title": title, "doc_type": doc_type, "type": "knowledge"}
        await self.vector_db_provider.upsert(
            namespace=_knowledge_namespace(user_id),
            documents=[VectorDocument(id=doc_id, text=normalized, embedding=embedding_result.embedding, metadata=metadata)],
        )
        return vector_ref_id

    async def query_knowledge_docs(self, *, user_id: str, query_text: str, top_k: int) -> list[dict[str, Any]]:
        """按文本查询知识库文档。"""
        namespace = _knowledge_namespace(user_id)
        if not await self.vector_db_provider.namespace_exists(namespace):
            return []
        results = await self.vector_db_provider.query_by_text(
            namespace=namespace,
            query_text=query_text.strip(),
            embedding_service=self.embedding_provider,
            top_k=top_k,
        )
        return [
            {"doc_id": item.id, "score": item.score, "content": item.text, "metadata": item.metadata or {}}
            for item in results
        ]

    async def delete_knowledge_doc(self, *, user_id: str, doc_id: str) -> bool:
        """删除指定知识库文档的向量记录。"""
        namespace = _knowledge_namespace(user_id)
        if not await self.vector_db_provider.namespace_exists(namespace):
            return True
        return await self.vector_db_provider.delete(namespace=namespace, document_ids=[doc_id])

    async def health_check(self) -> bool:
        """代理底层向量库健康检查。"""
        return await self.vector_db_provider.health_check()


class PromptLoader:
    """负责读取脚本生成 Prompt 模板。"""

    def __init__(self, prompts_dir: Path) -> None:
        """记录 Prompt 模板目录。"""
        self.prompts_dir = prompts_dir

    def load_script_prompt(self, mode: str) -> str:
        """按生成模式读取对应 Prompt。"""
        filename = {"mode_a": "mode_a_boom.txt", "mode_b": "mode_b_brain.txt"}.get(mode)
        if not filename:
            raise ValidationError(message=f"无效的生成模式: {mode}", field_errors={"mode": "仅支持 mode_a 和 mode_b"})
        prompt_file = self.prompts_dir / filename
        if not prompt_file.exists():
            raise ServiceUnavailableError(message=f"Prompt 模板缺失: {filename}", service_name="prompt_loader")
        return prompt_file.read_text(encoding="utf-8")


class EmptyWebSearchProvider(WebSearchProvider):
    """提供默认的空网页搜索实现。"""

    async def search(self, *, query_text: str, top_k: int) -> list[WebSearchResult]:
        """返回空搜索结果，保证本地默认不出网。"""
        return []


def create_audio_storage(upload_dir: str) -> LocalAudioStorage:
    """创建默认音频存储实现。"""
    return LocalAudioStorage(upload_dir)


def create_imported_audio_storage(upload_dir: str) -> LocalImportedAudioStorage:
    """创建默认导入音频存储实现。"""
    return LocalImportedAudioStorage(upload_dir)


def create_media_asset_storage(upload_dir: str) -> LocalMediaAssetStorage:
    """创建默认媒体资源存储实现。"""
    return LocalMediaAssetStorage(upload_dir)


def create_vector_store(*, embedding_provider: EmbeddingProvider, vector_db_provider: Any) -> AppVectorStore:
    """创建默认应用向量存储。"""
    return AppVectorStore(embedding_provider=embedding_provider, vector_db_provider=vector_db_provider)


def create_prompt_loader(prompts_dir: Path) -> PromptLoader:
    """创建默认 PromptLoader。"""
    return PromptLoader(prompts_dir)


def create_web_search_provider() -> WebSearchProvider:
    """创建默认网页搜索实现。"""
    return EmptyWebSearchProvider()


def create_external_media_provider() -> ExternalMediaProvider:
    """创建默认外链媒体 provider。"""
    return ExternalMediaService()


def create_workflow_provider(*, settings: Settings) -> WorkflowProvider:
    """创建默认工作流 provider。"""
    return DifyWorkflowProvider(
        base_url=settings.DIFY_BASE_URL,
        api_key=settings.DIFY_API_KEY,
    )
