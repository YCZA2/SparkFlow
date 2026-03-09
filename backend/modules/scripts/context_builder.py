from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from domains.fragments import repository as fragment_repository
from domains.knowledge import repository as knowledge_repository
from models import Fragment
from modules.shared.ports import VectorStore, WebSearchProvider
from utils.serialization import format_iso_datetime, parse_json_list

VALID_SCRIPT_MODES = {"mode_a", "mode_b"}


@dataclass
class ResearchContext:
    """描述提交给外挂工作流的结构化上下文。"""

    mode: str
    query_hint: str | None
    selected_fragments: list[dict[str, Any]]
    knowledge_hits: list[dict[str, Any]]
    web_hits: list[dict[str, Any]]
    user_context: dict[str, Any]
    generation_metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        """将上下文稳定转换为可持久化字典。"""
        return asdict(self)


class ScriptGenerationContextBuilder:
    """封装脚本生成的输入校验和研究上下文组装。"""

    def __init__(
        self,
        *,
        vector_store: VectorStore,
        web_search_provider: WebSearchProvider,
    ) -> None:
        """装配上下文构建依赖。"""
        self.vector_store = vector_store
        self.web_search_provider = web_search_provider

    def validate_fragments(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_ids: list[str],
        mode: str,
    ) -> list[Fragment]:
        """校验生成模式和可用碎片。"""
        if mode not in VALID_SCRIPT_MODES:
            raise ValidationError(message=f"无效的生成模式: {mode}", field_errors={"mode": "必须是 mode_a 或 mode_b"})
        fragments = fragment_repository.get_by_ids(db=db, user_id=user_id, fragment_ids=fragment_ids)
        found_ids = {fragment.id for fragment in fragments}
        missing_ids = sorted(set(fragment_ids) - found_ids)
        if missing_ids:
            raise NotFoundError(
                message=f"部分碎片不存在或无权访问: {', '.join(missing_ids)}",
                resource_type="fragment",
                resource_id=",".join(missing_ids),
            )
        if not any((fragment.transcript or "").strip() for fragment in fragments):
            raise ValidationError(message="选中的碎片均无可用文本，无法发起生成", field_errors={"fragment_ids": "碎片内容为空"})
        return fragments

    async def build_context(
        self,
        *,
        db: Session,
        user_id: str,
        fragments: list[Fragment],
        mode: str,
        query_hint: str | None,
        include_web_search: bool,
        vector_store: VectorStore | None = None,
        web_search_provider: WebSearchProvider | None = None,
    ) -> ResearchContext:
        """组装脚本生成所需的完整上下文。"""
        query_text = self.build_query_text(fragments=fragments, query_hint=query_hint)
        knowledge_hits = await self.search_knowledge(
            db=db,
            user_id=user_id,
            query_text=query_text,
            vector_store=vector_store,
        )
        web_hits = await self.search_web(
            query_text=query_text,
            include_web_search=include_web_search,
            web_search_provider=web_search_provider,
        )
        return ResearchContext(
            mode=mode,
            query_hint=query_hint,
            selected_fragments=[
                {
                    "id": fragment.id,
                    "transcript": fragment.transcript,
                    "summary": fragment.summary,
                    "tags": parse_json_list(fragment.tags),
                    "source": fragment.source,
                    "created_at": format_iso_datetime(fragment.created_at),
                }
                for fragment in fragments
            ],
            knowledge_hits=knowledge_hits,
            web_hits=web_hits,
            user_context={},
            generation_metadata={"query_text_preview": query_text[:120]},
        )

    @staticmethod
    def build_query_text(*, fragments: list[Fragment], query_hint: str | None) -> str:
        """生成知识库和网页搜索使用的查询词。"""
        if query_hint and query_hint.strip():
            return query_hint.strip()
        parts = [item.summary or item.transcript or "" for item in fragments]
        query_text = "\n".join(part.strip() for part in parts if part and part.strip()).strip()
        return query_text[:2000]

    async def search_knowledge(
        self,
        *,
        db: Session,
        user_id: str,
        query_text: str,
        vector_store: VectorStore | None = None,
    ) -> list[dict[str, Any]]:
        """查询与当前生成请求相关的知识库内容。"""
        if not query_text:
            return []
        runtime_vector_store = vector_store or self.vector_store
        results = await runtime_vector_store.query_knowledge_docs(user_id=user_id, query_text=query_text, top_k=5)
        doc_ids = [item.get("doc_id") for item in results if item.get("doc_id")]
        docs = {
            doc.id: doc
            for doc in knowledge_repository.list_by_user(db=db, user_id=user_id, limit=100, offset=0)
            if doc.id in doc_ids
        }
        hits: list[dict[str, Any]] = []
        for item in results:
            doc = docs.get(item.get("doc_id"))
            if not doc:
                continue
            hits.append(
                {
                    "doc_id": doc.id,
                    "title": doc.title,
                    "content": doc.content,
                    "doc_type": doc.doc_type,
                    "score": float(item.get("score") or 0.0),
                }
            )
        return hits

    async def search_web(
        self,
        *,
        query_text: str,
        include_web_search: bool,
        web_search_provider: WebSearchProvider | None = None,
    ) -> list[dict[str, Any]]:
        """按需补充网页搜索结果。"""
        if not include_web_search or not query_text.strip():
            return []
        runtime_web_search_provider = web_search_provider or self.web_search_provider
        results = await runtime_web_search_provider.search(query_text=query_text, top_k=5)
        return [{"title": item.title, "url": item.url, "snippet": item.snippet} for item in results]


def build_workflow_inputs(context: ResearchContext) -> dict[str, Any]:
    """保持统一结构化输入，由 provider 自行适配上游格式。"""
    return {
        "mode": context.mode,
        "query_hint": context.query_hint,
        "selected_fragments": context.selected_fragments,
        "knowledge_hits": context.knowledge_hits,
        "web_hits": context.web_hits,
        "user_context": context.user_context,
        "generation_metadata": context.generation_metadata,
    }
