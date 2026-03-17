from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy.orm import Session

from core.exceptions import NotFoundError, ValidationError
from domains.fragments import repository as fragment_repository
from domains.knowledge import repository as knowledge_repository
from models import Fragment
from modules.fragments.content import read_fragment_plain_text
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

    def validate_inputs(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_ids: list[str],
        fragment_snapshots: list[dict[str, Any]] | None,
        mode: str,
    ) -> list[dict[str, Any]]:
        """校验生成输入并统一收敛为快照结构。"""
        if mode not in VALID_SCRIPT_MODES:
            raise ValidationError(message=f"无效的生成模式: {mode}", field_errors={"mode": "必须是 mode_a 或 mode_b"})
        if fragment_snapshots:
            normalized_snapshots = [self._normalize_fragment_snapshot(item) for item in fragment_snapshots]
            if not any(self._fragment_snapshot_text(item).strip() for item in normalized_snapshots):
                raise ValidationError(message="选中的碎片均无可用文本，无法发起生成", field_errors={"fragment_ids": "碎片内容为空"})
            return normalized_snapshots
        fragments = fragment_repository.get_by_ids(db=db, user_id=user_id, fragment_ids=fragment_ids)
        found_ids = {fragment.id for fragment in fragments}
        missing_ids = sorted(set(fragment_ids) - found_ids)
        if missing_ids:
            raise NotFoundError(
                message=f"部分碎片不存在或无权访问: {', '.join(missing_ids)}",
                resource_type="fragment",
                resource_id=",".join(missing_ids),
            )
        normalized_snapshots = [self._map_fragment_to_snapshot(fragment) for fragment in fragments]
        if not any(self._fragment_snapshot_text(fragment).strip() for fragment in normalized_snapshots):
            raise ValidationError(message="选中的碎片均无可用文本，无法发起生成", field_errors={"fragment_ids": "碎片内容为空"})
        return normalized_snapshots

    async def build_context(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_snapshots: list[dict[str, Any]],
        mode: str,
        query_hint: str | None,
        include_web_search: bool,
        vector_store: VectorStore | None = None,
        web_search_provider: WebSearchProvider | None = None,
    ) -> ResearchContext:
        """组装脚本生成所需的完整上下文。"""
        query_text = self.build_query_text(fragment_snapshots=fragment_snapshots, query_hint=query_hint)
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
            selected_fragments=fragment_snapshots,
            knowledge_hits=knowledge_hits,
            web_hits=web_hits,
            user_context={},
            generation_metadata={"query_text_preview": query_text[:120]},
        )

    @staticmethod
    def build_query_text(*, fragment_snapshots: list[dict[str, Any]], query_hint: str | None) -> str:
        """生成知识库和网页搜索使用的查询词。"""
        if query_hint and query_hint.strip():
            return query_hint.strip()
        parts = [
            str(item.get("summary") or "").strip()
            or ScriptGenerationContextBuilder._fragment_snapshot_text(item)
            for item in fragment_snapshots
        ]
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
                    "body_markdown": doc.body_markdown,
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

    @staticmethod
    def _map_fragment_to_snapshot(fragment: Fragment) -> dict[str, Any]:
        """把远端 fragment 模型映射成统一快照结构。"""
        return {
            "id": fragment.id,
            "transcript": read_fragment_plain_text(fragment),
            "summary": fragment.summary,
            "tags": parse_json_list(fragment.tags),
            "source": fragment.source,
            "created_at": format_iso_datetime(fragment.created_at),
        }

    @staticmethod
    def _normalize_fragment_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
        """把客户端上传的本地快照压缩成上下文生成所需字段。"""
        plain_text_snapshot = str(snapshot.get("plain_text_snapshot") or "").strip()
        body_html = str(snapshot.get("body_html") or "").strip()
        transcript = plain_text_snapshot or body_html
        return {
            "id": str(snapshot.get("id") or "").strip(),
            "transcript": transcript,
            "summary": str(snapshot.get("summary") or "").strip() or None,
            "tags": [str(item).strip() for item in (snapshot.get("tags") or []) if str(item).strip()],
            "source": str(snapshot.get("source") or "manual").strip() or "manual",
            "created_at": str(snapshot.get("created_at") or "").strip() or None,
        }

    @staticmethod
    def _fragment_snapshot_text(snapshot: dict[str, Any]) -> str:
        """统一读取本地或远端快照中的可用正文。"""
        return str(snapshot.get("transcript") or "").strip()


def build_workflow_inputs(context: ResearchContext) -> dict[str, Any]:
    """将研究上下文压缩为工作流真正需要的文本输入。"""
    return {
        "mode": context.mode,
        "query_hint": (context.query_hint or "").strip(),
        "fragments_text": _build_fragments_text(context.selected_fragments),
        "knowledge_context": _build_knowledge_context(context.knowledge_hits),
        "web_context": _build_web_context(context.web_hits),
    }


def _build_fragments_text(fragments: list[dict[str, Any]]) -> str:
    """把碎片列表格式化为工作流直接可用的素材正文。"""
    blocks: list[str] = []
    for index, item in enumerate(fragments, start=1):
        if not isinstance(item, dict):
            continue
        transcript = str(item.get("transcript") or "").strip()
        if not transcript:
            continue
        blocks.append(f"碎片 {index}\n{transcript}")
    return "\n\n".join(blocks).strip()


def _build_knowledge_context(knowledge_hits: list[dict[str, Any]]) -> str:
    """把知识库命中压缩为引用说明文本，避免把整包 JSON 传入工作流。"""
    blocks: list[str] = []
    for index, item in enumerate(knowledge_hits, start=1):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        body_markdown = str(item.get("body_markdown") or "").strip()
        if not title and not body_markdown:
            continue
        lines = [f"参考 {index}"]
        if title:
            lines.append(f"标题: {title}")
        if body_markdown:
            lines.append(f"内容: {body_markdown}")
        blocks.append("\n".join(lines).strip())
    return "\n\n".join(blocks).strip()


def _build_web_context(web_hits: list[dict[str, Any]]) -> str:
    """把网页搜索命中整理为精简文本，减少 Dify Start 节点噪音。"""
    blocks: list[str] = []
    for index, item in enumerate(web_hits, start=1):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        url = str(item.get("url") or "").strip()
        snippet = str(item.get("snippet") or "").strip()
        if not title and not url and not snippet:
            continue
        lines = [f"网页 {index}"]
        if title:
            lines.append(f"标题: {title}")
        if url:
            lines.append(f"链接: {url}")
        if snippet:
            lines.append(f"摘要: {snippet}")
        blocks.append("\n".join(lines).strip())
    return "\n\n".join(blocks).strip()
