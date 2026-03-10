from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import shutil
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
from typing import Any

from fastapi import BackgroundTasks, UploadFile

from core.config import Settings
from core.exceptions import ServiceUnavailableError, ValidationError
from services.base import VectorDocument
from services.dify_workflow_provider import DifyWorkflowProvider
from services.external_media import ExternalMediaService

from .ports import (
    EmbeddingProvider,
    ExternalMediaProvider,
    FileAccess,
    FileStorage,
    JobRunner,
    MaterializedFile,
    StoredFile,
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


def normalize_object_key(value: str) -> str:
    """清洗对象 key，避免路径逃逸。"""
    normalized = value.strip().lstrip("/").replace("\\", "/")
    normalized = "/".join(part for part in normalized.split("/") if part not in {"", ".", ".."})
    if not normalized:
        raise ValidationError(message="对象键不能为空", field_errors={"object_key": "请提供有效对象键"})
    return normalized


def sanitize_filename(value: str, fallback: str) -> str:
    """清洗文件名，避免 OSS 和本地路径出现非法字符。"""
    stem = "".join("_" if ch in '\\/:*?"<>|' else ch for ch in (value or "").strip())
    stem = " ".join(stem.split()).strip(" .")
    return stem[:120] or fallback


def normalize_audio_extension(filename: str) -> str:
    """归一化音频扩展名。"""
    ext = Path(filename).suffix.lower()
    if not ext or ext == ".mp4":
        return ".m4a"
    return ext


def validate_audio_upload(file: UploadFile, content: bytes) -> tuple[str, str]:
    """校验上传音频并返回扩展名与 MIME。"""
    ext = normalize_audio_extension(file.filename or "")
    mime_type = (file.content_type or "application/octet-stream").lower()
    if ext not in ALLOWED_AUDIO_EXTENSIONS and mime_type not in ALLOWED_AUDIO_TYPES:
        raise ValidationError(
            message="不支持的音频文件格式",
            field_errors={"audio": "支持 .m4a、.wav、.mp3、.aac、.ogg、.opus"},
        )
    if len(content) > MAX_AUDIO_FILE_SIZE:
        raise ValidationError(
            message="音频文件过大",
            field_errors={"audio": "音频文件大小不能超过 50MB"},
        )
    return ext, mime_type


def validate_media_upload(file: UploadFile, media_kind: str, content: bytes) -> tuple[str, str]:
    """校验素材上传并返回扩展名与 MIME。"""
    normalized_kind = media_kind if media_kind in ALLOWED_MEDIA_EXTENSIONS else "file"
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_MEDIA_EXTENSIONS[normalized_kind]:
        raise ValidationError(
            message="不支持的媒体文件格式",
            field_errors={"file": f"{normalized_kind} 类型暂不支持该扩展名"},
        )
    if not content:
        raise ValidationError(message="上传文件为空", field_errors={"file": "请选择有效文件"})
    mime_type = (file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream").lower()
    return ext, mime_type


def build_audio_object_key(*, user_id: str, fragment_id: str, filename: str) -> str:
    """构造录音对象 key。"""
    return normalize_object_key(f"audio/original/{user_id}/{fragment_id}/{filename}")


def build_imported_audio_object_key(*, user_id: str, fragment_id: str, platform: str, filename: str) -> str:
    """构造外链导入音频对象 key。"""
    return normalize_object_key(f"audio/imported/{user_id}/{fragment_id}/{platform}/{filename}")


def build_media_asset_object_key(*, user_id: str, asset_id: str, filename: str) -> str:
    """构造素材对象 key。"""
    return normalize_object_key(f"media-assets/{user_id}/{asset_id}/{filename}")


class LocalFileStorage(FileStorage):
    """提供本地文件系统对象存储能力。"""

    def __init__(self, upload_dir: str) -> None:
        """记录本地对象存储根目录。"""
        self.upload_dir = Path(upload_dir).resolve()

    def _destination(self, object_key: str) -> Path:
        """把对象 key 映射为本地目标路径。"""
        destination = self.upload_dir / normalize_object_key(object_key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        return destination

    def _build_stored_file(
        self,
        *,
        object_key: str,
        original_filename: str,
        mime_type: str,
        file_size: int,
        checksum: str | None,
        access_level: str,
    ) -> StoredFile:
        """构造统一文件元数据。"""
        return StoredFile(
            storage_provider="local",
            bucket="local",
            object_key=normalize_object_key(object_key),
            access_level=access_level,
            original_filename=original_filename,
            mime_type=mime_type,
            file_size=file_size,
            checksum=checksum,
        )

    async def save_upload(
        self,
        *,
        file: UploadFile,
        object_key: str,
        original_filename: str,
        mime_type: str,
        access_level: str = "private",
    ) -> StoredFile:
        """保存上传文件到本地对象目录。"""
        content = await file.read()
        destination = self._destination(object_key)
        destination.write_bytes(content)
        checksum = hashlib.sha256(content).hexdigest()
        return self._build_stored_file(
            object_key=object_key,
            original_filename=original_filename,
            mime_type=mime_type,
            file_size=len(content),
            checksum=checksum,
            access_level=access_level,
        )

    async def save_local_file(
        self,
        *,
        source_path: str,
        object_key: str,
        original_filename: str,
        mime_type: str,
        access_level: str = "private",
    ) -> StoredFile:
        """复制本地临时文件到正式对象目录。"""
        source = Path(source_path).resolve()
        if not source.exists():
            raise ValidationError(message="源文件不存在", field_errors={"file": "临时文件不存在"})
        destination = self._destination(object_key)
        shutil.copy2(source, destination)
        checksum = hashlib.sha256(destination.read_bytes()).hexdigest()
        return self._build_stored_file(
            object_key=object_key,
            original_filename=original_filename,
            mime_type=mime_type,
            file_size=destination.stat().st_size,
            checksum=checksum,
            access_level=access_level,
        )

    def delete(self, stored_file: StoredFile | None) -> None:
        """删除本地对象文件。"""
        if stored_file is None:
            return
        candidate = self.upload_dir / normalize_object_key(stored_file.object_key)
        if candidate.exists():
            candidate.unlink()

    def create_download_url(self, stored_file: StoredFile) -> FileAccess:
        """为本地对象构造后端静态访问地址。"""
        return FileAccess(url=f"/uploads/{normalize_object_key(stored_file.object_key)}", expires_at=None)

    def materialize(self, stored_file: StoredFile) -> MaterializedFile:
        """直接返回本地对象路径。"""
        local_path = (self.upload_dir / normalize_object_key(stored_file.object_key)).resolve()
        return MaterializedFile(local_path=local_path, cleanup=lambda: None)

    def read_bytes(self, stored_file: StoredFile) -> bytes:
        """读取本地对象内容。"""
        return (self.upload_dir / normalize_object_key(stored_file.object_key)).read_bytes()


class OssFileStorage(FileStorage):
    """提供阿里云 OSS 对象存储能力。"""

    def __init__(
        self,
        *,
        endpoint: str,
        bucket_name: str,
        access_key_id: str,
        access_key_secret: str,
        url_expire_seconds: int,
        public_base_url: str | None = None,
    ) -> None:
        """初始化 OSS 客户端与签名参数。"""
        try:
            import oss2
        except Exception as exc:
            raise ServiceUnavailableError(message=f"OSS SDK 不可用: {exc}", service_name="oss") from exc
        normalized_endpoint = endpoint.strip()
        if not normalized_endpoint.startswith(("http://", "https://")):
            normalized_endpoint = f"https://{normalized_endpoint}"
        self._oss2 = oss2
        self.endpoint = normalized_endpoint
        self.bucket_name = bucket_name
        self.url_expire_seconds = url_expire_seconds
        self.public_base_url = public_base_url.strip().rstrip("/") if public_base_url else None
        auth = oss2.Auth(access_key_id, access_key_secret)
        self.bucket = oss2.Bucket(auth, normalized_endpoint, bucket_name)

    def _build_stored_file(
        self,
        *,
        object_key: str,
        original_filename: str,
        mime_type: str,
        file_size: int,
        checksum: str | None,
        access_level: str,
    ) -> StoredFile:
        """构造 OSS 文件元数据。"""
        return StoredFile(
            storage_provider="oss",
            bucket=self.bucket_name,
            object_key=normalize_object_key(object_key),
            access_level=access_level,
            original_filename=original_filename,
            mime_type=mime_type,
            file_size=file_size,
            checksum=checksum,
        )

    async def save_upload(
        self,
        *,
        file: UploadFile,
        object_key: str,
        original_filename: str,
        mime_type: str,
        access_level: str = "private",
    ) -> StoredFile:
        """把上传文件写入 OSS。"""
        content = await file.read()
        checksum = hashlib.sha256(content).hexdigest()
        headers = {"Content-Type": mime_type}
        self.bucket.put_object(normalize_object_key(object_key), content, headers=headers)
        return self._build_stored_file(
            object_key=object_key,
            original_filename=original_filename,
            mime_type=mime_type,
            file_size=len(content),
            checksum=checksum,
            access_level=access_level,
        )

    async def save_local_file(
        self,
        *,
        source_path: str,
        object_key: str,
        original_filename: str,
        mime_type: str,
        access_level: str = "private",
    ) -> StoredFile:
        """把本地临时文件上传到 OSS。"""
        source = Path(source_path).resolve()
        if not source.exists():
            raise ValidationError(message="源文件不存在", field_errors={"file": "临时文件不存在"})
        content = source.read_bytes()
        checksum = hashlib.sha256(content).hexdigest()
        headers = {"Content-Type": mime_type}
        self.bucket.put_object(normalize_object_key(object_key), content, headers=headers)
        return self._build_stored_file(
            object_key=object_key,
            original_filename=original_filename,
            mime_type=mime_type,
            file_size=len(content),
            checksum=checksum,
            access_level=access_level,
        )

    def delete(self, stored_file: StoredFile | None) -> None:
        """删除 OSS 对象。"""
        if stored_file is None:
            return
        self.bucket.delete_object(normalize_object_key(stored_file.object_key))

    def create_download_url(self, stored_file: StoredFile) -> FileAccess:
        """为 OSS 对象生成签名下载地址。"""
        object_key = normalize_object_key(stored_file.object_key)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=self.url_expire_seconds)
        if self.public_base_url:
            url = f"{self.public_base_url}/{object_key}"
        else:
            url = self.bucket.sign_url("GET", object_key, self.url_expire_seconds)
        return FileAccess(url=url, expires_at=expires_at.isoformat())

    def materialize(self, stored_file: StoredFile) -> MaterializedFile:
        """把 OSS 对象下载到临时文件，供 STT 和导出链路使用。"""
        object_key = normalize_object_key(stored_file.object_key)
        suffix = Path(stored_file.original_filename).suffix or Path(object_key).suffix
        temp_file = tempfile.NamedTemporaryFile(prefix="sparkflow-oss-", suffix=suffix, delete=False)
        temp_path = Path(temp_file.name)
        temp_file.close()
        self.bucket.get_object_to_file(object_key, str(temp_path))
        return MaterializedFile(local_path=temp_path, cleanup=lambda: temp_path.unlink(missing_ok=True))

    def read_bytes(self, stored_file: StoredFile) -> bytes:
        """读取 OSS 对象字节内容。"""
        result = self.bucket.get_object(normalize_object_key(stored_file.object_key))
        return result.read()


class FastApiBackgroundJobRunner(JobRunner):
    """把后台任务挂到 FastAPI BackgroundTasks。"""

    def __init__(self, background_tasks: BackgroundTasks) -> None:
        """保存 FastAPI 后台任务对象。"""
        self.background_tasks = background_tasks

    def schedule(self, task: Any, /, *args: Any, **kwargs: Any) -> None:
        """把任务转交给 FastAPI 处理。"""
        self.background_tasks.add_task(task, *args, **kwargs)


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

    async def health_check(self) -> bool:
        """检查向量服务健康状态。"""
        return await self.vector_db_provider.health_check()


class PromptLoader:
    """按需从磁盘读取 prompt 模板。"""

    def __init__(self, prompts_dir: Path) -> None:
        """记录 prompt 模板根目录。"""
        self.prompts_dir = prompts_dir

    def load(self, filename: str) -> str:
        """读取指定 prompt 文件内容。"""
        prompt_path = self.prompts_dir / filename
        if not prompt_path.exists():
            raise FileNotFoundError(f"Prompt file not found: {filename}")
        return prompt_path.read_text(encoding="utf-8")

    def load_script_prompt(self, mode: str) -> str:
        """按脚本模式读取对应 prompt 模板。"""
        mapping = {
            "mode_a": "mode_a_boom.txt",
            "mode_b": "mode_b_brain.txt",
        }
        filename = mapping.get((mode or "").strip())
        if filename is None:
            raise ValidationError(message="无效的脚本生成模式", field_errors={"mode": "必须是 mode_a 或 mode_b"})
        return self.load(filename)


class NoopWebSearchProvider(WebSearchProvider):
    """提供默认的空网页搜索实现。"""

    async def search(self, *, query_text: str, top_k: int) -> list[WebSearchResult]:
        """返回空搜索结果，避免默认请求出网。"""
        return []


def create_prompt_loader(prompts_dir: Path) -> PromptLoader:
    """构造 prompt 加载器。"""
    return PromptLoader(prompts_dir)


def create_vector_store(*, embedding_provider: EmbeddingProvider, vector_db_provider: Any) -> AppVectorStore:
    """构造应用级向量存储适配器。"""
    return AppVectorStore(embedding_provider=embedding_provider, vector_db_provider=vector_db_provider)


def create_file_storage(settings: Settings) -> FileStorage:
    """按配置创建本地或 OSS 对象存储实现。"""
    provider = (settings.FILE_STORAGE_PROVIDER or "local").strip().lower()
    if provider == "oss":
        required = {
            "OSS_ENDPOINT": settings.OSS_ENDPOINT,
            "OSS_BUCKET": settings.OSS_BUCKET,
            "OSS_ACCESS_KEY_ID": settings.OSS_ACCESS_KEY_ID,
            "OSS_ACCESS_KEY_SECRET": settings.OSS_ACCESS_KEY_SECRET,
        }
        missing = [key for key, value in required.items() if not value]
        if missing:
            raise ServiceUnavailableError(
                message=f"OSS 配置缺失: {', '.join(missing)}",
                service_name="oss",
            )
        return OssFileStorage(
            endpoint=settings.OSS_ENDPOINT or "",
            bucket_name=settings.OSS_BUCKET or "",
            access_key_id=settings.OSS_ACCESS_KEY_ID or "",
            access_key_secret=settings.OSS_ACCESS_KEY_SECRET or "",
            url_expire_seconds=settings.OSS_URL_EXPIRE_SECONDS,
            public_base_url=settings.OSS_PUBLIC_BASE_URL,
        )
    return LocalFileStorage(settings.UPLOAD_DIR)


def create_external_media_provider() -> ExternalMediaProvider:
    """构造外部媒体解析 provider。"""
    return ExternalMediaService()


def create_web_search_provider() -> WebSearchProvider:
    """构造默认网页搜索 provider。"""
    return NoopWebSearchProvider()


def create_workflow_provider(*, settings: Settings) -> WorkflowProvider:
    """构造外挂工作流 provider。"""
    return DifyWorkflowProvider(
        base_url=settings.DIFY_BASE_URL,
        api_key=settings.DIFY_API_KEY,
    )


def create_daily_push_workflow_provider(*, settings: Settings) -> WorkflowProvider:
    """构造每日推盘专用的外挂工作流 provider。"""
    return DifyWorkflowProvider(
        base_url=settings.DIFY_BASE_URL,
        api_key=settings.DIFY_DAILY_PUSH_API_KEY or settings.DIFY_API_KEY,
    )
