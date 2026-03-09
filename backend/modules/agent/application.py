from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy.orm import Session

from core.config import settings
from core.exceptions import NotFoundError, ValidationError
from domains.agent_runs import repository as agent_run_repository
from domains.fragments import repository as fragment_repository
from domains.knowledge import repository as knowledge_repository
from domains.scripts import repository as script_repository
from models import AgentRun, Fragment
from modules.shared.pipeline_runtime import PipelineExecutionContext, PipelineStepDefinition
from modules.shared.ports import VectorStore, WebSearchProvider
from utils.serialization import format_iso_datetime, parse_json_list

from .dify_client import DifyClient
from .schemas import AgentRunDetail, AgentRunResult

WORKFLOW_TYPE_SCRIPT_RESEARCH = "script_research"
WORKFLOW_TYPE_SCRIPT_GENERATION = "script_generation"
SUCCESS_STATUSES = {"succeeded", "success", "completed"}
FAILED_STATUSES = {"failed", "error", "stopped"}
VALID_SCRIPT_MODES = {"mode_a", "mode_b"}
PIPELINE_TYPE_SCRIPT_GENERATION = "script_generation"


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
        pipeline_runner,
        pipeline_dispatcher,
    ) -> None:
        self.dify_client = dify_client
        self.vector_store = vector_store
        self.web_search_provider = web_search_provider
        self.pipeline_runner = pipeline_runner
        self.pipeline_dispatcher = pipeline_dispatcher

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
        """创建统一脚本流水线，并保留 agent_runs 兼容投影。"""
        fragments = self._validate_fragments(db=db, user_id=user_id, fragment_ids=fragment_ids, mode=mode)
        run_id = None
        run = await self.pipeline_runner.create_run(
            run_id=run_id,
            user_id=user_id,
            pipeline_type=PIPELINE_TYPE_SCRIPT_GENERATION,
            input_payload={
                "fragment_ids": fragment_ids,
                "mode": mode,
                "query_hint": query_hint,
                "include_web_search": include_web_search,
                "workflow_type": workflow_type,
            },
            resource_type="agent_run",
            resource_id=None,
        )
        agent_run = AgentRun(
            id=run.id,
            user_id=user_id,
            workflow_type=workflow_type,
            mode=mode,
            source_fragment_ids=json.dumps(fragment_ids, ensure_ascii=False),
            query_hint=query_hint,
            include_web_search=include_web_search,
            request_payload_json=json.dumps({"fragment_ids": fragment_ids}, ensure_ascii=False),
            dify_workflow_id=settings.DIFY_SCRIPT_WORKFLOW_ID,
            status="queued",
        )
        db.add(agent_run)
        db.commit()
        db.refresh(agent_run)
        return agent_run

    async def refresh_run(self, *, db: Session, user_id: str, run_id: str) -> AgentRun:
        """唤醒 dispatcher 并返回最新兼容 agent_run 视图。"""
        self.pipeline_dispatcher.wake_up()
        return AgentRunQueryService().get_run(db=db, user_id=user_id, run_id=run_id)

    async def create_script_generation_run(
        self,
        *,
        db: Session,
        user_id: str,
        fragment_ids: list[str],
        mode: str,
    ) -> AgentRun:
        """创建面向脚本生成入口的异步流水线。"""
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
        """兼容旧同步路径，等待脚本流水线进入终态。"""
        timeout = max(0.2, float(timeout_seconds or settings.DIFY_POLL_TIMEOUT_SECONDS))
        await self.pipeline_dispatcher.run_until_terminal(run_id=run_id, user_id=user_id, timeout_seconds=timeout)
        return AgentRunQueryService().get_run(db=db, user_id=user_id, run_id=run_id)

    async def _build_context(
        self,
        *,
        db: Session,
        user_id: str,
        fragments: list[Fragment],
        mode: str,
        query_hint: str | None,
        include_web_search: bool,
        workflow_type: str,
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
                "workflow_type": workflow_type,
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
        return payload.get("error") or payload.get("message") or payload.get("status") or "Dify 工作流执行失败"

    def _runtime_dify_client(self, context: PipelineExecutionContext) -> DifyClient:
        """按当前容器状态构造 Dify 客户端，确保测试替身可生效。"""
        return DifyClient(
            base_url=settings.DIFY_BASE_URL,
            api_key=settings.DIFY_API_KEY,
            http_client=context.container.dify_http_client,
        )

    def _validate_fragments(self, *, db: Session, user_id: str, fragment_ids: list[str], mode: str) -> list[Fragment]:
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
            raise ValidationError(message="选中的碎片均无可用文本，无法发起研究", field_errors={"fragment_ids": "碎片内容为空"})
        return fragments

    def build_pipeline_definitions(self) -> list[PipelineStepDefinition]:
        """返回脚本生成流水线固定步骤定义。"""
        return [
            PipelineStepDefinition(step_name="collect_fragments_context", executor=self.collect_fragments_context, max_attempts=1),
            PipelineStepDefinition(step_name="collect_knowledge_hits", executor=self.collect_knowledge_hits, max_attempts=1),
            PipelineStepDefinition(step_name="collect_web_hits", executor=self.collect_web_hits, max_attempts=1),
            PipelineStepDefinition(step_name="submit_dify_workflow", executor=self.submit_dify_workflow, max_attempts=2),
            PipelineStepDefinition(step_name="poll_dify_workflow", executor=self.poll_dify_workflow, max_attempts=4),
            PipelineStepDefinition(step_name="persist_script", executor=self.persist_script, max_attempts=2),
            PipelineStepDefinition(step_name="finalize_run", executor=self.finalize_run, max_attempts=1),
        ]

    async def collect_fragments_context(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """组装碎片上下文。"""
        payload = context.input_payload
        fragments = self._validate_fragments(
            db=context.db,
            user_id=context.run.user_id,
            fragment_ids=payload["fragment_ids"],
            mode=payload["mode"],
        )
        research_context = await self._build_context(
            db=context.db,
            user_id=context.run.user_id,
            fragments=fragments,
            mode=payload["mode"],
            query_hint=payload.get("query_hint"),
            include_web_search=payload.get("include_web_search", False),
            workflow_type=payload.get("workflow_type") or WORKFLOW_TYPE_SCRIPT_GENERATION,
        )
        return {"research_context": asdict(research_context)}

    async def collect_knowledge_hits(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """复用上一步已经组装好的知识命中。"""
        research_context = context.get_step_output("collect_fragments_context").get("research_context") or {}
        return {"knowledge_hits": research_context.get("knowledge_hits") or []}

    async def collect_web_hits(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """复用上一步已经组装好的网页命中。"""
        research_context = context.get_step_output("collect_fragments_context").get("research_context") or {}
        return {"web_hits": research_context.get("web_hits") or []}

    async def submit_dify_workflow(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """向 Dify 提交一次工作流运行。"""
        research_context = context.get_step_output("collect_fragments_context").get("research_context") or {}
        workflow_run = await self._runtime_dify_client(context).submit_workflow_run(
            inputs=_build_dify_inputs(ResearchContext(**research_context)),
            user=context.run.user_id,
        )
        agent_run = agent_run_repository.get_by_id(db=context.db, user_id=context.run.user_id, run_id=context.run.id)
        if agent_run:
            agent_run_repository.mark_submitted(db=context.db, run=agent_run, dify_run_id=workflow_run.run_id)
            if workflow_run.workflow_id:
                agent_run_repository.update_result_payload(
                    db=context.db,
                    run=agent_run,
                    result_payload_json=json.dumps({"raw_payload": workflow_run.raw_payload}, ensure_ascii=False),
                    dify_workflow_id=workflow_run.workflow_id,
                )
        return {
            "dify_run_id": workflow_run.run_id,
            "workflow_id": workflow_run.workflow_id,
            "raw_payload": workflow_run.raw_payload,
            "external_ref": {"dify_run_id": workflow_run.run_id},
        }

    async def poll_dify_workflow(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """查询 Dify 工作流状态。"""
        dify_run_id = context.get_step_output("submit_dify_workflow").get("dify_run_id")
        if not dify_run_id:
            raise ValidationError(message="工作流尚未成功提交到 Dify", field_errors={"run_id": "缺少 Dify 运行 ID"})
        workflow_run = await self._runtime_dify_client(context).get_workflow_run(run_id=dify_run_id)
        parsed = self._parse_outputs(workflow_run.outputs)
        raw_payload = {"raw_payload": workflow_run.raw_payload, "result": parsed}
        agent_run = agent_run_repository.get_by_id(db=context.db, user_id=context.run.user_id, run_id=context.run.id)
        if workflow_run.status in FAILED_STATUSES:
            if agent_run:
                agent_run_repository.mark_failed(
                    db=context.db,
                    run=agent_run,
                    error_message=self._resolve_failure_message(workflow_run.raw_payload),
                    result_payload_json=json.dumps(raw_payload, ensure_ascii=False),
                )
            raise RuntimeError(self._resolve_failure_message(workflow_run.raw_payload))
        if workflow_run.status not in SUCCESS_STATUSES:
            if agent_run:
                agent_run_repository.mark_running(
                    db=context.db,
                    run=agent_run,
                    result_payload_json=json.dumps(raw_payload, ensure_ascii=False),
                )
            raise RuntimeError("workflow still running")
        if agent_run:
            agent_run_repository.mark_running(
                db=context.db,
                run=agent_run,
                result_payload_json=json.dumps(raw_payload, ensure_ascii=False),
            )
        return {
            "workflow_id": workflow_run.workflow_id,
            "result": parsed,
            "raw_payload": workflow_run.raw_payload,
            "external_ref": {"dify_run_id": dify_run_id},
        }

    async def persist_script(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """在 Dify 成功后回流创建本地脚本。"""
        payload = context.input_payload
        poll_payload = context.get_step_output("poll_dify_workflow")
        parsed = poll_payload.get("result") or {}
        draft = (parsed.get("draft") or "").strip()
        if not draft:
            raise ValidationError(message="Dify 输出缺少 draft，无法创建口播稿", field_errors={"generation": "工作流执行失败"})
        existing = script_repository.get_by_id(db=context.db, user_id=context.run.user_id, script_id=context.run.resource_id or "")
        if existing:
            return {"script_id": existing.id, "result": parsed}
        script = script_repository.create(
            db=context.db,
            user_id=context.run.user_id,
            content=draft,
            mode=payload["mode"],
            source_fragment_ids=json.dumps(payload["fragment_ids"], ensure_ascii=False),
            title=parsed.get("title"),
        )
        agent_run = agent_run_repository.get_by_id(db=context.db, user_id=context.run.user_id, run_id=context.run.id)
        if agent_run:
            agent_run.script_id = script.id
            context.db.commit()
        return {"script_id": script.id, "result": parsed}

    async def finalize_run(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """结束脚本流水线并固化兼容 agent_run 投影。"""
        payload = context.input_payload
        poll_payload = context.get_step_output("poll_dify_workflow")
        persist_payload = context.get_step_output("persist_script")
        raw_payload_json = json.dumps(
            {
                "raw_payload": poll_payload.get("raw_payload") or {},
                "result": persist_payload.get("result") or {},
                "script_id": persist_payload.get("script_id"),
            },
            ensure_ascii=False,
        )
        agent_run = agent_run_repository.get_by_id(db=context.db, user_id=context.run.user_id, run_id=context.run.id)
        if agent_run:
            agent_run_repository.mark_succeeded(
                db=context.db,
                run=agent_run,
                script_id=persist_payload["script_id"],
                result_payload_json=raw_payload_json,
                dify_workflow_id=poll_payload.get("workflow_id"),
            )
        return {
            "resource_type": "script",
            "resource_id": persist_payload["script_id"],
            "run_output": {
                "script_id": persist_payload["script_id"],
                "result": persist_payload.get("result") or {},
                "mode": payload["mode"],
            },
        }


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


def build_script_workflow_pipeline_service(container) -> ScriptWorkflowUseCase:
    """基于容器组装脚本流水线服务。"""
    return ScriptWorkflowUseCase(
        dify_client=DifyClient(
            base_url=settings.DIFY_BASE_URL,
            api_key=settings.DIFY_API_KEY,
            http_client=container.dify_http_client,
        ),
        vector_store=container.vector_store,
        web_search_provider=container.web_search_provider,
        pipeline_runner=container.pipeline_runner,
        pipeline_dispatcher=container.pipeline_dispatcher,
    )
