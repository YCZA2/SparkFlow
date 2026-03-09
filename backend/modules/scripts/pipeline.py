from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from core.exceptions import ValidationError
from models import PipelineRun
from .context_builder import ResearchContext, ScriptGenerationContextBuilder, build_workflow_inputs
from .persistence import ScriptGenerationPersistenceService
from modules.shared.pipeline_runtime import PipelineExecutionContext, PipelineExecutionError, PipelineStepDefinition
from modules.shared.ports import WorkflowProvider

SUCCESS_STATUSES = {"succeeded", "success", "completed"}
FAILED_STATUSES = {"failed", "error", "stopped"}
PIPELINE_TYPE_SCRIPT_GENERATION = "script_generation"


class ScriptGenerationPipelineService:
    """负责脚本生成流水线的定义、创建与推进。"""

    def __init__(
        self,
        *,
        workflow_provider: WorkflowProvider,
        context_builder: ScriptGenerationContextBuilder,
        persistence_service: ScriptGenerationPersistenceService,
        pipeline_runner,
    ) -> None:
        """装配脚本流水线依赖。"""
        self.workflow_provider = workflow_provider
        self.context_builder = context_builder
        self.persistence_service = persistence_service
        self.pipeline_runner = pipeline_runner

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
        self.context_builder.validate_fragments(db=db, user_id=user_id, fragment_ids=fragment_ids, mode=mode)
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

    def _runtime_workflow_provider(self, context: PipelineExecutionContext) -> WorkflowProvider:
        """按当前容器状态读取运行时 provider。"""
        return context.container.workflow_provider

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
        fragments = self.context_builder.validate_fragments(
            db=context.db,
            user_id=context.run.user_id,
            fragment_ids=payload["fragment_ids"],
            mode=payload["mode"],
        )
        research_context = await self.context_builder.build_context(
            db=context.db,
            user_id=context.run.user_id,
            fragments=fragments,
            mode=payload["mode"],
            query_hint=payload.get("query_hint"),
            include_web_search=payload.get("include_web_search", False),
            vector_store=context.container.vector_store,
            web_search_provider=context.container.web_search_provider,
        )
        return {"research_context": research_context.to_dict()}

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
            inputs=build_workflow_inputs(ResearchContext(**research_context)),
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
        parsed = self.persistence_service.parse_outputs(workflow_run.outputs)
        if workflow_run.status in FAILED_STATUSES:
            raise PipelineExecutionError(self.persistence_service.resolve_failure_message(workflow_run.raw_payload), retryable=False)
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
        return self.persistence_service.persist_script(
            db=context.db,
            run=context.run,
            input_payload=payload,
            parsed_result=poll_payload.get("result") or {},
        )

    async def finalize_run(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """结束流水线并固化最终脚本结果。"""
        payload = context.input_payload
        persist_payload = context.get_step_output("persist_script")
        return self.persistence_service.build_finalize_payload(
            script_id=persist_payload["script_id"],
            parsed_result=persist_payload.get("result") or {},
            mode=payload["mode"],
        )


def build_script_generation_pipeline_service(container) -> ScriptGenerationPipelineService:
    """基于容器组装脚本流水线服务。"""
    return ScriptGenerationPipelineService(
        workflow_provider=container.workflow_provider,
        context_builder=ScriptGenerationContextBuilder(
            vector_store=container.vector_store,
            web_search_provider=container.web_search_provider,
        ),
        persistence_service=ScriptGenerationPersistenceService(),
        pipeline_runner=container.pipeline_runner,
    )
