from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from fastapi import BackgroundTasks, Request, UploadFile
from sqlalchemy.orm import Session, sessionmaker

from core.config import Settings, settings
from core.exceptions import ServiceUnavailableError, ValidationError
from models.database import SessionLocal
from services.base import VectorDocument
from services.factory import (
    create_embedding_service,
    create_llm_service,
    create_stt_service,
    create_vector_db_service,
)

from .ports import AudioStorage, EmbeddingProvider, JobRunner, SpeechToTextProvider, TextGenerationProvider, VectorStore

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


def _fragment_namespace(user_id: str) -> str:
    return f"{FRAGMENT_NAMESPACE_PREFIX}_{user_id}"


def _knowledge_namespace(user_id: str) -> str:
    return f"{KNOWLEDGE_NAMESPACE_PREFIX}_{user_id}"


class LocalAudioStorage(AudioStorage):
    def __init__(self, upload_dir: str) -> None:
        self.upload_dir = Path(upload_dir).resolve()

    @staticmethod
    def _file_extension(filename: str) -> str:
        ext = Path(filename).suffix.lower()
        if not ext or ext == ".mp4":
            return ".m4a"
        return ext

    def _ensure_dir(self, user_id: str) -> Path:
        user_dir = self.upload_dir / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir

    async def save(self, *, audio: UploadFile, user_id: str) -> dict[str, Any]:
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
        raw_path = Path(audio_path)
        if raw_path.is_absolute():
            return raw_path
        return (self.upload_dir.parent / raw_path).resolve()

    def delete(self, audio_path: Optional[str]) -> None:
        if not audio_path:
            return
        candidate = self.resolve_path(audio_path)
        if candidate.exists():
            candidate.unlink()


class FastApiBackgroundJobRunner(JobRunner):
    def __init__(self, background_tasks: BackgroundTasks) -> None:
        self.background_tasks = background_tasks

    def schedule(self, task: Any, /, *args: Any, **kwargs: Any) -> None:
        self.background_tasks.add_task(task, *args, **kwargs)


class AppVectorStore(VectorStore):
    def __init__(self, embedding_provider: EmbeddingProvider, vector_db_provider: Any) -> None:
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
        namespace = _knowledge_namespace(user_id)
        if not await self.vector_db_provider.namespace_exists(namespace):
            return True
        return await self.vector_db_provider.delete(namespace=namespace, document_ids=[doc_id])

    async def health_check(self) -> bool:
        return await self.vector_db_provider.health_check()


class PromptLoader:
    def __init__(self, prompts_dir: Path) -> None:
        self.prompts_dir = prompts_dir

    def load_script_prompt(self, mode: str) -> str:
        filename = {"mode_a": "mode_a_boom.txt", "mode_b": "mode_b_brain.txt"}.get(mode)
        if not filename:
            raise ValidationError(message=f"无效的生成模式: {mode}", field_errors={"mode": "仅支持 mode_a 和 mode_b"})
        prompt_file = self.prompts_dir / filename
        if not prompt_file.exists():
            raise ServiceUnavailableError(message=f"Prompt 模板缺失: {filename}", service_name="prompt_loader")
        return prompt_file.read_text(encoding="utf-8")


@dataclass
class ServiceContainer:
    settings: Settings
    session_factory: sessionmaker[Session]
    llm_provider: TextGenerationProvider
    stt_provider: SpeechToTextProvider
    embedding_provider: EmbeddingProvider
    vector_store: VectorStore
    audio_storage: AudioStorage
    prompt_loader: PromptLoader


def build_container() -> ServiceContainer:
    llm_provider = create_llm_service()
    stt_provider = create_stt_service()
    embedding_provider = create_embedding_service()
    vector_db_provider = create_vector_db_service()
    return ServiceContainer(
        settings=settings,
        session_factory=SessionLocal,
        llm_provider=llm_provider,
        stt_provider=stt_provider,
        embedding_provider=embedding_provider,
        vector_store=AppVectorStore(embedding_provider=embedding_provider, vector_db_provider=vector_db_provider),
        audio_storage=LocalAudioStorage(settings.UPLOAD_DIR),
        prompt_loader=PromptLoader(Path(__file__).resolve().parents[2] / "prompts"),
    )


def get_container(request: Request) -> ServiceContainer:
    return request.app.state.container


def get_db_session(request: Request):
    session = get_container(request).session_factory()
    try:
        yield session
    finally:
        session.close()
