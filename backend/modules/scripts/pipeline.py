from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy.orm import Session

from core.config import settings
from core.exceptions import NotFoundError, ValidationError
from domains.fragments import repository as fragment_repository
from domains.knowledge import repository as knowledge_repository
from domains.pipelines import repository as pipeline_repository
from domains.scripts import repository as script_repository
from models import Fragment, PipelineRun
from modules.shared.pipeline_runtime import PipelineExecutionContext, PipelineExecutionError, PipelineStepDefinition
from modules.shared.ports import VectorStore, WebSearchProvider, WorkflowProvider
from utils.serialization import format_iso_datetime, parse_json_list

SUCCESS_STATUSES = {"succeeded", "success", "completed"}
FAILED_STATUSES = {"failed", "error", "stopped"}
VALID_SCRIPT_MODES = {"mode_a", "mode_b"}
PIPELINE_TYPE_SCRIPT_GENERATION = "script_generation"


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


def _build_query_text(*, fragments: list[Fragment], query_hint: str | None) -> str:
    """生成知识库和网页搜索使用的查询词。"""
    if query_hint and query_hint.strip():
        return query_hint.strip()
    parts = [item.summary or item.transcript or "" for item in fragments]
    query_text = "\n".join(part.strip() for part in parts if part and part.strip()).strip()
    return query_text[:2000]


def _build_workflow_inputs(context: ResearchContext) -> dict[str, Any]:
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


class ScriptGenerationPipelineService:
    """负责脚本生成流水线的定义、创建与推进。"""

    def __init__(
        self,
        *,
        workflow_provider: WorkflowProvider,
        vector_store: VectorStore,
        web_search_provider: WebSearchProvider,
        pipeline_runner,
        pipeline_dispatcher,
    ) -> None:
        """装配脚本流水线依赖。"""
        self.workflow_provider = workflow_provider
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
    ) -> PipelineRun:
        """创建脚本生成任务态流水线。"""
        self._validate_fragments(db=db, user_id=user_id, fragment_ids=fragment_ids, mode=mode)
        return await self.pipeline_runner.create_run(
            run_id=None,
            user_id=user_id,
            pipeline_type=PIPELINE_TYPE_SCRIPT_GENERATION,
            input_payload={
                "fragment_ids": fragment_ids,
                "mode": mode,
                "query_hint": query_hint,
                "include_web_search": include_web_search,
            },
            resource_type=None,
            resource_id=None,
            auto_wake=True,
        )

    async def wait_for_script(
        self,
        *,
        db: Session,
        user_id: str,
        run_id: str,
        timeout_seconds: int | None = None,
    ) -> PipelineRun:
        """等待脚本流水线进入终态，供兼容同步路径复用。"""
        timeout = max(0.2, float(timeout_seconds or settings.DIFY_POLL_TIMEOUT_SECONDS))
        await self.pipeline_dispatcher.run_until_terminal(run_id=run_id, user_id=user_id, timeout_seconds=timeout)
        run = pipeline_repository.get_by_id(db=db, user_id=user_id, run_id=run_id)
        if not run:
            raise NotFoundError(message="脚本生成流水线不存在或无权访问", resource_type="pipeline_run", resource_id=run_id)
        return run

    async def _build_context(
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
        query_text = _build_query_text(fragments=fragments, query_hint=query_hint)
        knowledge_hits = await self._search_knowledge(
            db=db,
            user_id=user_id,
            query_text=query_text,
            vector_store=vector_store,
        )
        web_hits = await self._search_web(
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

    async def _search_knowledge(
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

    async def _search_web(
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

    def _parse_outputs(self, outputs: dict[str, Any]) -> dict[str, Any]:
        """规范化外挂工作流输出字段。"""
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
        """提取 provider 失败时最可读的错误信息。"""
        return payload.get("error") or payload.get("message") or payload.get("status") or "外挂工作流执行失败"

    def _runtime_workflow_provider(self, context: PipelineExecutionContext) -> WorkflowProvider:
        """按当前容器状态读取运行时 provider。"""
        return context.container.workflow_provider

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
            raise ValidationError(message="选中的碎片均无可用文本，无法发起生成", field_errors={"fragment_ids": "碎片内容为空"})
        return fragments

    def build_pipeline_definitions(self) -> list[PipelineStepDefinition]:
        """返回脚本生成流水线的固定步骤。"""
        return [
            PipelineStepDefinition(step_name="collect_fragments_context", executor=self.collect_fragments_context, max_attempts=1),
            PipelineStepDefinition(step_name="collect_knowledge_hits", executor=self.collect_knowledge_hits, max_attempts=1),
            PipelineStepDefinition(step_name="collect_web_hits", executor=self.collect_web_hits, max_attempts=1),
            PipelineStepDefinition(step_name="submit_workflow_run", executor=self.submit_workflow_run, max_attempts=2),
            PipelineStepDefinition(step_name="poll_workflow_run", executor=self.poll_workflow_run, max_attempts=4),
            PipelineStepDefinition(step_name="persist_script", executor=self.persist_script, max_attempts=2),
            PipelineStepDefinition(step_name="finalize_run", executor=self.finalize_run, max_attempts=1),
        ]

    async def collect_fragments_context(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """组装碎片、知识库和搜索所需的基础上下文。"""
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
            vector_store=context.container.vector_store,
            web_search_provider=context.container.web_search_provider,
        )
        return {"research_context": asdict(research_context)}

    async def collect_knowledge_hits(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """复用上一步产出的知识库命中结果。"""
        research_context = context.get_step_output("collect_fragments_context").get("research_context") or {}
        return {"knowledge_hits": research_context.get("knowledge_hits") or []}

    async def collect_web_hits(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """复用上一步产出的网页搜索结果。"""
        research_context = context.get_step_output("collect_fragments_context").get("research_context") or {}
        return {"web_hits": research_context.get("web_hits") or []}

    async def submit_workflow_run(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """向统一 workflow provider 提交运行。"""
        research_context = context.get_step_output("collect_fragments_context").get("research_context") or {}
        workflow_run = await self._runtime_workflow_provider(context).submit_run(
            inputs=_build_workflow_inputs(ResearchContext(**research_context)),
            user_id=context.run.user_id,
        )
        return {
            "provider_run_id": workflow_run.provider_run_id or workflow_run.run_id,
            "workflow_id": workflow_run.provider_workflow_id,
            "raw_payload": workflow_run.raw_payload,
            "external_ref": {"provider_run_id": workflow_run.provider_run_id or workflow_run.run_id},
        }

    async def poll_workflow_run(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """查询 workflow provider 的最新运行状态。"""
        provider_run_id = context.get_step_output("submit_workflow_run").get("provider_run_id")
        if not provider_run_id:
            raise ValidationError(message="工作流尚未成功提交到 provider", field_errors={"run_id": "缺少 provider 运行 ID"})
        workflow_run = await self._runtime_workflow_provider(context).get_run(run_id=provider_run_id)
        parsed = self._parse_outputs(workflow_run.outputs)
        if workflow_run.status in FAILED_STATUSES:
            raise PipelineExecutionError(self._resolve_failure_message(workflow_run.raw_payload), retryable=False)
        if workflow_run.status not in SUCCESS_STATUSES:
            raise PipelineExecutionError("workflow still running", retryable=True)
        return {
            "workflow_id": workflow_run.provider_workflow_id,
            "result": parsed,
            "raw_payload": workflow_run.raw_payload,
            "external_ref": {"provider_run_id": provider_run_id},
        }

    async def persist_script(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """在 workflow 成功后回流创建脚本记录。"""
        payload = context.input_payload
        poll_payload = context.get_step_output("poll_workflow_run")
        parsed = poll_payload.get("result") or {}
        draft = (parsed.get("draft") or "").strip()
        if not draft:
            raise ValidationError(message="工作流输出缺少 draft，无法创建口播稿", field_errors={"generation": "工作流执行失败"})
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
        pipeline_repository.update_run_resource(
            db=context.db,
            run_id=context.run.id,
            resource_type="script",
            resource_id=script.id,
            output_payload={"script_id": script.id, "result": parsed, "mode": payload["mode"]},
        )
        return {"script_id": script.id, "result": parsed}

    async def finalize_run(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """结束流水线并固化最终脚本结果。"""
        payload = context.input_payload
        persist_payload = context.get_step_output("persist_script")
        return {
            "resource_type": "script",
            "resource_id": persist_payload["script_id"],
            "run_output": {
                "script_id": persist_payload["script_id"],
                "result": persist_payload.get("result") or {},
                "mode": payload["mode"],
            },
        }


def build_script_generation_pipeline_service(container) -> ScriptGenerationPipelineService:
    """基于容器组装脚本流水线服务。"""
    return ScriptGenerationPipelineService(
        workflow_provider=container.workflow_provider,
        vector_store=container.vector_store,
        web_search_provider=container.web_search_provider,
        pipeline_runner=container.pipeline_runner,
        pipeline_dispatcher=container.pipeline_dispatcher,
    )
