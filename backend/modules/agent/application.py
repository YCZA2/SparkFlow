from __future__ import annotations

import asyncio
import json
from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy.orm import Session

from core.config import settings
from core.exceptions import NotFoundError, ServiceUnavailableError, ValidationError
from domains.agent_runs import repository as agent_run_repository
from domains.fragments import repository as fragment_repository
from domains.knowledge import repository as knowledge_repository
from domains.scripts import repository as script_repository
from models import AgentRun, Fragment
from modules.shared.ports import VectorStore, WebSearchProvider
from utils.serialization import format_iso_datetime, parse_json_list

from .dify_client import DifyClient
from .schemas import AgentRunDetail, AgentRunResult

WORKFLOW_TYPE_SCRIPT_RESEARCH = "script_research"
WORKFLOW_TYPE_SCRIPT_GENERATION = "script_generation"
RUNNING_STATUSES = {"queued", "running"}
SUCCESS_STATUSES = {"succeeded", "success", "completed"}
FAILED_STATUSES = {"failed", "error", "stopped"}
VALID_SCRIPT_MODES = {"mode_a", "mode_b"}


@dataclass
class ResearchContext:
    mode: str
    query_hint: str | None
    selected_fragments: list[dict[str, Any]]
    knowledge_hits: list[dict[str, Any]]
    web_hits: list[dict[str, Any]]
    user_context: dict[str, Any]
    generation_metadata: dict[str, Any]


def _build_query_text(*, fragments: list[Fragment], query_hint: str | None) -> str:
    if query_hint and query_hint.strip():
        return query_hint.strip()
    parts = [item.summary or item.transcript or "" for item in fragments]
    query_text = "\n".join(part.strip() for part in parts if part and part.strip()).strip()
    return query_text[:2000]


def _map_result_payload(payload_json: str | None) -> AgentRunResult | None:
    """将持久化的结果载荷映射为对外响应结构。"""
    if not payload_json:
        return None
    try:
        payload = json.loads(payload_json)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    result = payload.get("result") if isinstance(payload.get("result"), dict) else payload
    return AgentRunResult(
        title=result.get("title"),
        outline=result.get("outline"),
        draft=result.get("draft"),
        used_sources=result.get("used_sources") or [],
        review_notes=result.get("review_notes"),
        model_metadata=result.get("model_metadata"),
    )


def _build_dify_inputs(context: ResearchContext) -> dict[str, Any]:
    """将复杂上下文字段序列化为 JSON 字符串，兼容 Dify Start 节点。"""
    return {
        "mode": context.mode,
        "query_hint": context.query_hint or "",
        "selected_fragments": json.dumps(context.selected_fragments, ensure_ascii=False),
        "knowledge_hits": json.dumps(context.knowledge_hits, ensure_ascii=False),
        "web_hits": json.dumps(context.web_hits, ensure_ascii=False),
        "user_context": json.dumps(context.user_context, ensure_ascii=False),
        "generation_metadata": json.dumps(context.generation_metadata, ensure_ascii=False),
    }


def map_agent_run(run: AgentRun) -> AgentRunDetail:
    """将工作流运行记录转换为 API 响应。"""
    return AgentRunDetail(
        id=run.id,
        workflow_type=run.workflow_type,  # type: ignore[arg-type]
        status=run.status,
        mode=run.mode,
        query_hint=run.query_hint,
        include_web_search=run.include_web_search,
        source_fragment_ids=parse_json_list(run.source_fragment_ids, allow_csv_fallback=False) or [],
        dify_workflow_id=run.dify_workflow_id,
        dify_run_id=run.dify_run_id,
        script_id=run.script_id,
        error_message=run.error_message,
        result=_map_result_payload(run.result_payload_json),
        created_at=format_iso_datetime(run.created_at),
        updated_at=format_iso_datetime(run.updated_at),
        finished_at=format_iso_datetime(run.finished_at),
    )


class AgentRunQueryService:
    def get_run(self, *, db: Session, user_id: str, run_id: str) -> AgentRun:
        """按用户读取单条工作流运行记录。"""
        run = agent_run_repository.get_by_id(db=db, user_id=user_id, run_id=run_id)
        if not run:
            raise NotFoundError(message="工作流运行记录不存在或无权访问", resource_type="agent_run", resource_id=run_id)
        return run


class ScriptWorkflowUseCase:
    def __init__(
        self,
        *,
        dify_client: DifyClient,
        vector_store: VectorStore,
        web_search_provider: WebSearchProvider,
    ) -> None:
        self.dify_client = dify_client
        self.vector_store = vector_store
        self.web_search_provider = web_search_provider

    async def create_run(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_ids: list[str],
        mode: str,
        query_hint: str | None,
        include_web_search: bool,
        workflow_type: str,
    ) -> AgentRun:
        """创建一条新的脚本工作流运行并提交到 Dify。"""
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
            raise ValidationError(message="选中的碎片均无可用文本，无法发起研究", field_errors={"fragment_ids": "碎片内容为空"})

        context = await self._build_context(
            db=db,
            user_id=user_id,
            fragments=fragments,
            mode=mode,
            query_hint=query_hint,
            include_web_search=include_web_search,
        )
        request_payload_json = json.dumps(asdict(context), ensure_ascii=False)
        dify_inputs = _build_dify_inputs(context)
        run = agent_run_repository.create(
            db=db,
            user_id=user_id,
            workflow_type=workflow_type,
            mode=mode,
            source_fragment_ids=json.dumps(fragment_ids, ensure_ascii=False),
            query_hint=query_hint,
            include_web_search=include_web_search,
            request_payload_json=request_payload_json,
            dify_workflow_id=settings.DIFY_SCRIPT_WORKFLOW_ID,
        )

        try:
            workflow_run = await self.dify_client.submit_workflow_run(inputs=dify_inputs, user=user_id)
        except Exception as exc:
            agent_run_repository.mark_failed(db=db, run=run, error_message=str(exc))
            raise
        run = agent_run_repository.mark_submitted(db=db, run=run, dify_run_id=workflow_run.run_id)
        if workflow_run.workflow_id:
            agent_run_repository.update_result_payload(
                db=db,
                run=run,
                result_payload_json=json.dumps({"raw_payload": workflow_run.raw_payload}, ensure_ascii=False),
                dify_workflow_id=workflow_run.workflow_id,
            )
        return run

    async def refresh_run(self, *, db: Session, user_id: str, run_id: str) -> AgentRun:
        """刷新运行状态，并在成功后回流创建脚本。"""
        run = AgentRunQueryService().get_run(db=db, user_id=user_id, run_id=run_id)
        if run.status == "succeeded" or run.status == "failed":
            return run
        if not run.dify_run_id:
            raise ValidationError(message="工作流尚未成功提交到 Dify", field_errors={"run_id": "缺少 Dify 运行 ID"})

        workflow_run = await self.dify_client.get_workflow_run(run_id=run.dify_run_id)
        raw_payload_json = json.dumps({"raw_payload": workflow_run.raw_payload, "result": self._parse_outputs(workflow_run.outputs)}, ensure_ascii=False)
        if workflow_run.status in FAILED_STATUSES:
            return agent_run_repository.mark_failed(
                db=db,
                run=run,
                error_message=self._resolve_failure_message(workflow_run.raw_payload),
                result_payload_json=raw_payload_json,
            )
        if workflow_run.status in SUCCESS_STATUSES:
            parsed = self._parse_outputs(workflow_run.outputs)
            draft = (parsed.get("draft") or "").strip()
            if not draft:
                return agent_run_repository.mark_failed(
                    db=db,
                    run=run,
                    error_message="Dify 输出缺少 draft，无法创建口播稿",
                    result_payload_json=raw_payload_json,
                )
            if run.script_id:
                return agent_run_repository.mark_succeeded(
                    db=db,
                    run=run,
                    script_id=run.script_id,
                    result_payload_json=raw_payload_json,
                    dify_workflow_id=workflow_run.workflow_id,
                )
            script = script_repository.create(
                db=db,
                user_id=user_id,
                content=draft,
                mode=run.mode,
                source_fragment_ids=run.source_fragment_ids or "[]",
                title=parsed.get("title"),
            )
            return agent_run_repository.mark_succeeded(
                db=db,
                run=run,
                script_id=script.id,
                result_payload_json=raw_payload_json,
                dify_workflow_id=workflow_run.workflow_id,
            )
        return agent_run_repository.mark_running(db=db, run=run, result_payload_json=raw_payload_json)

    async def create_script_generation_run(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_ids: list[str],
        mode: str,
    ) -> AgentRun:
        """创建面向统一脚本生成入口的工作流运行。"""
        return await self.create_run(
            db=db,
            user_id=user_id,
            fragment_ids=fragment_ids,
            mode=mode,
            query_hint=None,
            include_web_search=False,
            workflow_type=WORKFLOW_TYPE_SCRIPT_GENERATION,
        )

    async def wait_for_script(
        self,
        *,
        db: Session,
        user_id: str,
        run_id: str,
        timeout_seconds: int | None = None,
    ) -> AgentRun:
        """在有限时间内轮询脚本生成结果，避免前端显式处理工作流状态。"""
        timeout = max(0.1, float(timeout_seconds or settings.DIFY_POLL_TIMEOUT_SECONDS))
        interval = max(0.05, float(settings.DIFY_POLL_INTERVAL_SECONDS))
        deadline = asyncio.get_running_loop().time() + timeout

        while True:
            run = await self.refresh_run(db=db, user_id=user_id, run_id=run_id)
            if run.status in {"succeeded", "failed"}:
                return run
            if asyncio.get_running_loop().time() >= deadline:
                raise ServiceUnavailableError(message="生成超时，请稍后重试", service_name="dify")
            await asyncio.sleep(interval)

    async def _build_context(
        self,
        *,
        db: Session,
        user_id: str,
        fragments: list[Fragment],
        mode: str,
        query_hint: str | None,
        include_web_search: bool,
    ) -> ResearchContext:
        """组装提交给 Dify 的统一脚本生成上下文。"""
        query_text = _build_query_text(fragments=fragments, query_hint=query_hint)
        knowledge_hits = await self._search_knowledge(db=db, user_id=user_id, query_text=query_text)
        web_hits = await self._search_web(query_text=query_text, include_web_search=include_web_search)
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
            generation_metadata={
                "workflow_type": WORKFLOW_TYPE_SCRIPT_RESEARCH if query_hint or include_web_search else WORKFLOW_TYPE_SCRIPT_GENERATION,
                "query_text_preview": query_text[:120],
            },
        )

    async def _search_knowledge(self, *, db: Session, user_id: str, query_text: str) -> list[dict[str, Any]]:
        """查询与当前生成请求相关的知识库内容。"""
        if not query_text:
            return []
        results = await self.vector_store.query_knowledge_docs(user_id=user_id, query_text=query_text, top_k=5)
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

    async def _search_web(self, *, query_text: str, include_web_search: bool) -> list[dict[str, Any]]:
        """按需补充网页搜索结果。"""
        if not include_web_search or not query_text.strip():
            return []
        results = await self.web_search_provider.search(query_text=query_text, top_k=5)
        return [{"title": item.title, "url": item.url, "snippet": item.snippet} for item in results]

    def _parse_outputs(self, outputs: dict[str, Any]) -> dict[str, Any]:
        """规范化 Dify 输出字段，供脚本落库和排障复用。"""
        if not isinstance(outputs, dict):
            return {}
        return {
            "title": outputs.get("title"),
            "outline": outputs.get("outline"),
            "draft": outputs.get("draft"),
            "used_sources": outputs.get("used_sources") or [],
            "review_notes": outputs.get("review_notes"),
            "model_metadata": outputs.get("model_metadata"),
        }

    def _resolve_failure_message(self, payload: dict[str, Any]) -> str:
        """提取 Dify 失败时最可读的错误信息。"""
        return (
            payload.get("error")
            or payload.get("message")
            or payload.get("status")
            or "Dify 工作流执行失败"
        )


class ScriptResearchRunUseCase(ScriptWorkflowUseCase):
    """兼容现有命名的脚本研究工作流用例。"""

    async def create_run(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_ids: list[str],
        mode: str,
        query_hint: str | None,
        include_web_search: bool,
    ) -> AgentRun:
        """保持原研究工作流接口不变。"""
        return await super().create_run(
            db=db,
            user_id=user_id,
            fragment_ids=fragment_ids,
            mode=mode,
            query_hint=query_hint,
            include_web_search=include_web_search,
            workflow_type=WORKFLOW_TYPE_SCRIPT_RESEARCH,
        )
