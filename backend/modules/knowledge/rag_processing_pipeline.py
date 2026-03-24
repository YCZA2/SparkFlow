"""
参考脚本处理流水线。

上传参考脚本后异步执行：LLM 风格分析 → 分块向量化 → 回写风格描述。
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from core.logging_config import get_logger
from domains.knowledge import repository as knowledge_repository
from modules.shared.ports import KnowledgeIndexStore
from modules.shared.pipeline.pipeline_runtime import (
    PipelineExecutionContext,
    PipelineExecutionError,
    PipelineStepDefinition,
)

from .chunking import build_knowledge_chunks

logger = get_logger(__name__)

PIPELINE_TYPE_REFERENCE_SCRIPT_PROCESSING = "reference_script_processing"

# 风格分析系统提示路径
_STYLE_ANALYSIS_PROMPT_PATH = Path(__file__).parent.parent.parent / "prompts" / "rag_style_analysis.txt"


def _load_style_analysis_prompt() -> str:
    """读取风格分析系统提示文本。"""
    return _STYLE_ANALYSIS_PROMPT_PATH.read_text(encoding="utf-8").strip()


class ReferenceScriptProcessingPipelineService:
    """负责参考脚本处理流水线的步骤定义与执行。"""

    def __init__(self, *, pipeline_runner: Any, knowledge_index_store: KnowledgeIndexStore) -> None:
        """装配参考脚本处理流水线依赖。"""
        self.pipeline_runner = pipeline_runner
        self.knowledge_index_store = knowledge_index_store

    async def create_run(
        self,
        *,
        doc_id: str,
        user_id: str,
        script_text: str,
        title: str,
        doc_type: str,
    ) -> Any:
        """创建参考脚本处理流水线任务。"""
        return await self.pipeline_runner.create_run(
            run_id=None,
            user_id=user_id,
            pipeline_type=PIPELINE_TYPE_REFERENCE_SCRIPT_PROCESSING,
            input_payload={
                "doc_id": doc_id,
                "user_id": user_id,
                "script_text": script_text,
                "title": title,
                "doc_type": doc_type,
            },
            resource_type="knowledge_doc",
            resource_id=doc_id,
            auto_wake=True,
        )

    def build_pipeline_definitions(self) -> list[PipelineStepDefinition]:
        """返回参考脚本处理流水线的固定步骤。"""
        return [
            PipelineStepDefinition(step_name="analyze_style", executor=self.analyze_style, max_attempts=2),
            PipelineStepDefinition(step_name="chunk_and_vectorize", executor=self.chunk_and_vectorize, max_attempts=2),
            PipelineStepDefinition(step_name="persist_style", executor=self.persist_style, max_attempts=2),
            PipelineStepDefinition(step_name="finalize_run", executor=self.finalize_run, max_attempts=1),
        ]

    async def analyze_style(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """调用 LLM 对脚本全文进行风格分析，输出结构化风格描述。"""
        script_text = context.input_payload.get("script_text", "")
        if not script_text.strip():
            raise PipelineExecutionError("参考脚本内容为空，无法分析风格", retryable=False)
        try:
            system_prompt = _load_style_analysis_prompt()
        except Exception as exc:
            raise PipelineExecutionError(f"读取风格分析提示词失败: {exc}", retryable=False) from exc
        style_description = await context.container.llm_provider.generate(
            system_prompt=system_prompt,
            user_message=script_text,
            temperature=0.3,
        )
        if not style_description or not style_description.strip():
            raise PipelineExecutionError("LLM 未返回风格描述", retryable=True)
        return {"style_description": style_description.strip()}

    async def chunk_and_vectorize(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """将参考脚本分块并批量写入向量库。"""
        script_text = context.input_payload.get("script_text", "")
        doc_id = context.input_payload.get("doc_id", "")
        user_id = context.run.user_id
        title = context.input_payload.get("title", "") or doc_id
        doc_type = context.input_payload.get("doc_type", "reference_script")
        chunks = build_knowledge_chunks(script_text)
        if not chunks:
            raise PipelineExecutionError("脚本文本无法切分成有效块", retryable=False)
        ref_id = await self.knowledge_index_store.refresh_document(
            user_id=user_id,
            doc_id=doc_id,
            title=title,
            doc_type=doc_type,
            chunks=chunks,
        )
        return {"chunk_count": len(chunks), "ref_ids": [ref_id] if ref_id else []}

    async def persist_style(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """原子回写风格描述与索引元数据，避免两次提交之间的状态不一致。"""
        style_description = context.get_step_output("analyze_style").get("style_description", "")
        doc_id = context.input_payload.get("doc_id", "")
        chunk_output = context.get_step_output("chunk_and_vectorize")
        doc = knowledge_repository.update_style_and_index_state(
            context.db,
            doc_id=doc_id,
            user_id=context.run.user_id,
            style_description=style_description,
            processing_status="ready",
            processing_error=None,
            vector_ref_id=(chunk_output.get("ref_ids") or [None])[0],
            chunk_count=chunk_output.get("chunk_count"),
        )
        if not doc:
            raise PipelineExecutionError(f"知识库文档不存在，无法回写风格与索引状态: {doc_id}", retryable=False)
        return {"doc_id": doc_id, "processing_status": "ready"}

    async def finalize_run(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """结束流水线，返回最终状态摘要。"""
        doc_id = context.input_payload.get("doc_id", "")
        chunk_count = context.get_step_output("chunk_and_vectorize").get("chunk_count", 0)
        return {
            "resource_type": "knowledge_doc",
            "resource_id": doc_id,
            "chunk_count": chunk_count,
        }


def build_reference_script_processing_pipeline_service(container: Any) -> ReferenceScriptProcessingPipelineService:
    """基于服务容器装配参考脚本处理流水线服务。"""
    return ReferenceScriptProcessingPipelineService(
        pipeline_runner=container.pipeline_runner,
        knowledge_index_store=container.knowledge_index_store,
    )
