from __future__ import annotations

from typing import Any

from core.exceptions import NotFoundError
from domains.fragments import repository as fragment_repository
from modules.fragments.content import read_fragment_plain_text
from modules.shared.pipeline.pipeline_runtime import PipelineExecutionContext, PipelineExecutionError, PipelineStepDefinition

from .derivative_service import FragmentDerivativeService

PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL = "fragment_derivative_backfill"


class FragmentDerivativePipelineService:
    """负责异步回填 fragment 摘要、标签和向量。"""

    def build_pipeline_definitions(self) -> list[PipelineStepDefinition]:
        """返回 fragment 衍生字段回填的固定步骤定义。"""
        return [
            PipelineStepDefinition(
                step_name="refresh_fragment_derivatives",
                executor=self.refresh_fragment_derivatives,
                max_attempts=2,
            ),
            PipelineStepDefinition(
                step_name="finalize_fragment_derivative_backfill",
                executor=self.finalize_run,
                max_attempts=1,
            ),
        ]

    def _runtime_derivative_service(self, context: PipelineExecutionContext) -> FragmentDerivativeService:
        """按当前容器状态构造衍生字段服务，确保运行时替换 provider 后立即生效。"""
        return FragmentDerivativeService(
            vector_store=context.container.vector_store,
            llm_provider=context.container.llm_provider,
        )

    async def refresh_fragment_derivatives(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """读取最新 fragment 内容并异步补齐摘要、标签和向量。"""
        payload = context.input_payload
        fragment_id = str(payload.get("fragment_id") or "").strip()
        if not fragment_id:
            raise PipelineExecutionError("缺少待回填的 fragment 标识", retryable=False)
        fragment = fragment_repository.get_by_id(
            db=context.db,
            user_id=context.run.user_id,
            fragment_id=fragment_id,
        )
        if fragment is None:
            raise PipelineExecutionError(
                str(
                    NotFoundError(
                        message="碎片不存在或无权访问",
                        resource_type="fragment",
                        resource_id=fragment_id,
                    )
                ),
                retryable=False,
            )
        effective_text = str(payload.get("effective_text") or "").strip() or read_fragment_plain_text(fragment) or ""
        summary, tags = await self._runtime_derivative_service(context).backfill_fragment_derivatives(
            db=context.db,
            user_id=context.run.user_id,
            fragment=fragment,
            effective_text=effective_text,
        )
        return {
            "fragment_id": fragment.id,
            "summary": summary,
            "tags": tags,
            "effective_text": effective_text,
        }

    async def finalize_run(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """构造 fragment 衍生字段回填流水线的稳定终态输出。"""
        payload = context.get_step_output("refresh_fragment_derivatives")
        return {
            "resource_type": "fragment",
            "resource_id": payload.get("fragment_id"),
            "run_output": {
                "fragment_id": payload.get("fragment_id"),
                "summary": payload.get("summary"),
                "tags": payload.get("tags") or [],
            },
        }


def build_fragment_derivative_pipeline_service(container) -> FragmentDerivativePipelineService:
    """基于容器组装 fragment 衍生字段回填流水线服务。"""
    return FragmentDerivativePipelineService()
