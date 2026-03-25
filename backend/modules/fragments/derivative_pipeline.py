from __future__ import annotations

from typing import Any

from domains.fragments import repository as fragment_repository
from modules.fragments.content import read_fragment_plain_text
from modules.shared.fragment_snapshots import FragmentSnapshotReader, read_fragment_snapshot_text
from modules.shared.pipeline.pipeline_runtime import PipelineExecutionContext, PipelineExecutionError, PipelineStepDefinition

from .derivative_service import FragmentDerivativeService

PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL = "fragment_derivative_backfill"
_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


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
        local_fragment_id = str(payload.get("local_fragment_id") or "").strip()
        logical_fragment_id = local_fragment_id or fragment_id
        if not logical_fragment_id:
            raise PipelineExecutionError("缺少待回填的 fragment 标识", retryable=False)
        fragment = None
        if fragment_id:
            fragment = fragment_repository.get_by_id(
                db=context.db,
                user_id=context.run.user_id,
                fragment_id=fragment_id,
            )
        derivative_service = self._runtime_derivative_service(context)
        if fragment is not None:
            effective_text = str(payload.get("effective_text") or "").strip() or read_fragment_plain_text(fragment) or ""
            summary, tags = await derivative_service.backfill_fragment_derivatives(
                db=context.db,
                user_id=context.run.user_id,
                fragment=fragment,
                effective_text=effective_text,
            )
        else:
            snapshot = _FRAGMENT_SNAPSHOT_READER.get_by_id(
                db=context.db,
                user_id=context.run.user_id,
                fragment_id=logical_fragment_id,
            )
            effective_text = (
                str(payload.get("effective_text") or "").strip()
                or (read_fragment_snapshot_text(snapshot) if snapshot is not None else "")
            )
            summary, tags = await derivative_service.backfill_snapshot_derivatives(
                user_id=context.run.user_id,
                fragment_id=logical_fragment_id,
                source=str(payload.get("source") or getattr(snapshot, "source", "") or "voice"),
                effective_text=effective_text,
                body_html=getattr(snapshot, "body_html", "") if snapshot is not None else None,
            )
        return {
            "fragment_id": fragment.id if fragment is not None else (fragment_id or None),
            "local_fragment_id": local_fragment_id or None,
            "logical_fragment_id": logical_fragment_id,
            "summary": summary,
            "tags": tags,
            "effective_text": effective_text,
        }

    async def finalize_run(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """构造 fragment 衍生字段回填流水线的稳定终态输出。"""
        payload = context.get_step_output("refresh_fragment_derivatives")
        local_fragment_id = payload.get("local_fragment_id")
        logical_fragment_id = payload.get("logical_fragment_id")
        return {
            "resource_type": "local_fragment" if local_fragment_id else "fragment",
            "resource_id": local_fragment_id or logical_fragment_id,
            "run_output": {
                "fragment_id": payload.get("fragment_id"),
                "local_fragment_id": local_fragment_id,
                "summary": payload.get("summary"),
                "tags": payload.get("tags") or [],
            },
        }


def build_fragment_derivative_pipeline_service(container) -> FragmentDerivativePipelineService:
    """基于容器组装 fragment 衍生字段回填流水线服务。"""
    return FragmentDerivativePipelineService()
