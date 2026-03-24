"""
RAG 脚本生成流水线。

主题驱动 + 参考脚本 RAG 的脚本生成 pipeline：
  1. generate_outline   - LLM 按 SOP 生成大纲
  2. retrieve_examples  - 向量检索 top-3 参考脚本块 + 提取风格描述
  3. generate_script_draft - LLM 综合风格+示例+大纲+碎片背景生成脚本
  4. persist_script     - 复用 ScriptGenerationPersistenceService 写入 scripts 表
  5. finalize_run       - 结束流水线
"""

from __future__ import annotations

import functools
from pathlib import Path
from typing import Any

from core.exceptions import ValidationError
from core.logging_config import get_logger
from domains.fragments import repository as fragment_repository
from models import PipelineRun
from modules.shared.pipeline.pipeline_runtime import (
    PipelineExecutionContext,
    PipelineExecutionError,
    PipelineStepDefinition,
)
from modules.shared.prompt_loader import load_prompt_text, render_prompt_template
from .persistence import ScriptGenerationPersistenceService
from .rag_context_builder import build_generation_prompt, build_generation_system_prompt
from .writing_context import MethodologyPayload, StableCorePayload
from .writing_context_builder import build_writing_context_bundle

PIPELINE_TYPE_RAG_SCRIPT_GENERATION = "rag_script_generation"

logger = get_logger(__name__)

# SOP 大纲生成提示词路径
_OUTLINE_PROMPT_PATH = Path(__file__).parent.parent.parent / "prompts" / "rag_outline.txt"
_OUTLINE_USER_PROMPT_PATH = Path(__file__).parent.parent.parent / "prompts" / "rag_outline_user.txt"


@functools.cache
def _load_outline_prompt() -> str:
    """读取 SOP 大纲生成系统提示词（首次调用后常驻内存）。"""
    return load_prompt_text(_OUTLINE_PROMPT_PATH)


class RagScriptPipelineService:
    """负责 RAG 脚本生成流水线的定义与执行。"""

    def __init__(
        self,
        *,
        persistence_service: ScriptGenerationPersistenceService,
        pipeline_runner: Any,
    ) -> None:
        """装配 RAG 脚本流水线依赖。"""
        self.persistence_service = persistence_service
        self.pipeline_runner = pipeline_runner

    async def create_run(
        self,
        *,
        user_id: str,
        topic: str,
        fragment_ids: list[str],
    ) -> PipelineRun:
        """创建 RAG 脚本生成任务态流水线。"""
        if not topic.strip():
            raise ValidationError(message="主题不能为空", field_errors={"topic": "请输入脚本主题"})
        return await self.pipeline_runner.create_run(
            run_id=None,
            user_id=user_id,
            pipeline_type=PIPELINE_TYPE_RAG_SCRIPT_GENERATION,
            input_payload={
                "topic": topic.strip(),
                "fragment_ids": fragment_ids,
                "mode": "mode_rag",
            },
            resource_type=None,
            resource_id=None,
            auto_wake=True,
        )

    def build_pipeline_definitions(self) -> list[PipelineStepDefinition]:
        """返回 RAG 脚本生成流水线的固定步骤。"""
        return [
            PipelineStepDefinition(step_name="generate_outline", executor=self.generate_outline, max_attempts=2),
            PipelineStepDefinition(step_name="retrieve_examples", executor=self.retrieve_examples, max_attempts=1),
            PipelineStepDefinition(step_name="generate_script_draft", executor=self.generate_script_draft, max_attempts=2),
            PipelineStepDefinition(step_name="persist_script", executor=self.persist_script, max_attempts=2),
            PipelineStepDefinition(step_name="finalize_run", executor=self.finalize_run, max_attempts=1),
        ]

    async def generate_outline(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """调用 LLM 按 SOP 模板为主题生成 JSON 格式大纲。"""
        topic = context.input_payload.get("topic", "")
        if not topic:
            raise PipelineExecutionError("主题为空，无法生成大纲", retryable=False)
        try:
            system_prompt = _load_outline_prompt()
        except Exception as exc:
            raise PipelineExecutionError(f"读取大纲提示词失败: {exc}", retryable=False) from exc
        raw_outline = await context.container.llm_provider.generate(
            system_prompt=system_prompt,
            user_message=render_prompt_template(_OUTLINE_USER_PROMPT_PATH, topic=topic),
            temperature=0.5,
        )
        if not raw_outline or not raw_outline.strip():
            raise PipelineExecutionError("LLM 未返回大纲内容", retryable=True)
        # 尝试提取 JSON 块（LLM 可能在 JSON 外包一层说明）
        outline_json = _extract_json_block(raw_outline)
        return {"outline_json": outline_json, "raw_outline": raw_outline}

    async def retrieve_examples(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """聚合稳定内核、方法论和相关素材三层上下文。"""
        topic = context.input_payload.get("topic", "")
        user_id = context.run.user_id
        writing_context = await build_writing_context_bundle(
            db=context.db,
            user_id=user_id,
            query_text=topic,
            llm_provider=context.container.llm_provider,
            vector_store=context.container.vector_store,
            knowledge_index_store=context.container.knowledge_index_store,
            exclude_fragment_ids=context.input_payload.get("fragment_ids") or [],
        )
        reference_hits = await context.container.knowledge_index_store.search_reference_examples(
            user_id=user_id,
            query_text=topic,
            top_k=3,
        )
        style_description = ""
        reference_examples: list[str] = []
        if reference_hits:
            from domains.knowledge import repository as knowledge_repository

            top_doc = knowledge_repository.get_by_id(
                db=context.db,
                user_id=user_id,
                doc_id=reference_hits[0].doc_id,
            )
            if top_doc and top_doc.style_description:
                style_description = top_doc.style_description
            for hit in reference_hits:
                for chunk in hit.matched_chunks or []:
                    if chunk and chunk not in reference_examples:
                        reference_examples.append(chunk)
        if (
            not writing_context.stable_core.content
            and not writing_context.methodologies
            and not writing_context.related_scripts
            and not writing_context.related_fragments
            and not writing_context.related_knowledge
            and not reference_examples
        ):
            logger.info("retrieve_examples_empty", topic=topic, user_id=user_id)
        return {
            "stable_core": {
                "content": writing_context.stable_core.content,
                "source_summary": writing_context.stable_core.source_summary,
            },
            "methodologies": [
                {
                    "title": item.title,
                    "content": item.content,
                    "source_type": item.source_type,
                }
                for item in writing_context.methodologies
            ],
            "related_scripts": writing_context.related_scripts,
            "related_fragments": writing_context.related_fragments,
            "related_knowledge": writing_context.related_knowledge,
            "reference_examples": reference_examples,
            "style_description": style_description,
        }

    async def generate_script_draft(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """综合风格描述、示例、大纲和可选碎片背景，调用 LLM 生成最终脚本草稿。"""
        topic = context.input_payload.get("topic", "")
        fragment_ids = context.input_payload.get("fragment_ids") or []

        outline_output = context.get_step_output("generate_outline")
        outline_json = outline_output.get("outline_json", "") or outline_output.get("raw_outline", "")

        examples_output = context.get_step_output("retrieve_examples")
        stable_core_payload = examples_output.get("stable_core") or {}
        stable_core = StableCorePayload(
            content=str(stable_core_payload.get("content") or ""),
            source_summary=str(stable_core_payload.get("source_summary") or ""),
        )
        methodologies = [
            MethodologyPayload(
                title=str(item.get("title") or ""),
                content=str(item.get("content") or ""),
                source_type=str(item.get("source_type") or ""),
            )
            for item in (examples_output.get("methodologies") or [])
            if isinstance(item, dict)
        ]
        related_scripts = examples_output.get("related_scripts") or []
        related_fragments = examples_output.get("related_fragments") or []
        related_knowledge = examples_output.get("related_knowledge") or []
        reference_examples = examples_output.get("reference_examples") or []
        style_description = examples_output.get("style_description", "")

        # 如有可选碎片 ID，从数据库读取其纯文本内容作为补充背景
        fragment_texts: list[str] = []
        if fragment_ids:
            fragments = fragment_repository.get_by_ids(
                db=context.db,
                user_id=context.run.user_id,
                fragment_ids=fragment_ids,
            )
            for frag in fragments:
                text = (frag.plain_text_snapshot or frag.transcript or "").strip()
                if text:
                    fragment_texts.append(text)

        user_message = build_generation_prompt(
            topic=topic,
            outline_json=outline_json,
            stable_core=stable_core,
            methodologies=methodologies,
            related_scripts=related_scripts,
            related_fragments=related_fragments,
            related_knowledge=related_knowledge,
            style_description=style_description,
            reference_examples=reference_examples,
            fragment_texts=fragment_texts,
        )
        system_prompt = build_generation_system_prompt()

        draft = await context.container.llm_provider.generate(
            system_prompt=system_prompt,
            user_message=user_message,
            temperature=0.7,
        )
        if not draft or not draft.strip():
            raise PipelineExecutionError("LLM 未返回脚本草稿", retryable=True)

        # 以大纲第一节名称或主题作为标题备选
        title = _extract_title_from_topic(topic)
        return {"draft": draft.strip(), "title": title}

    async def persist_script(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """将 LLM 草稿写入 scripts 表，复用现有持久化服务。"""
        draft_output = context.get_step_output("generate_script_draft")
        return self.persistence_service.persist_script(
            db=context.db,
            run=context.run,
            input_payload=context.input_payload,
            parsed_result={
                "draft": draft_output.get("draft", ""),
                "title": draft_output.get("title"),
            },
            provider_metadata=None,
        )

    async def finalize_run(self, context: PipelineExecutionContext) -> dict[str, Any]:
        """结束流水线并固化最终脚本结果。"""
        persist_payload = context.get_step_output("persist_script")
        return self.persistence_service.build_finalize_payload(
            script_id=persist_payload["script_id"],
            parsed_result=persist_payload.get("result") or {},
            mode="mode_rag",
            provider_metadata=None,
        )


def _extract_json_block(text: str) -> str:
    """从 LLM 输出中提取 JSON 块，去除可能存在的 Markdown 代码围栏。"""
    text = text.strip()
    # 去除 ```json ... ``` 或 ``` ... ``` 围栏
    if text.startswith("```"):
        lines = text.splitlines()
        # 去掉首行（```json 或 ```）和末行（```）
        inner_lines = lines[1:-1] if lines[-1].strip() == "```" else lines[1:]
        text = "\n".join(inner_lines).strip()
    return text


def _extract_title_from_topic(topic: str) -> str:
    """从主题中提取简短标题，最多 20 字。"""
    stripped = topic.strip()
    return stripped[:20] if len(stripped) > 20 else stripped


def build_rag_script_pipeline_service(container: Any) -> RagScriptPipelineService:
    """基于服务容器装配 RAG 脚本生成流水线服务。"""
    return RagScriptPipelineService(
        persistence_service=ScriptGenerationPersistenceService(),
        pipeline_runner=container.pipeline_runner,
    )
