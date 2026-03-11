from __future__ import annotations

from modules.shared.editor_document import build_document_from_text, extract_plain_text_from_document, normalize_editor_document
from modules.shared.ports import TextGenerationProvider


class FragmentAiEditService:
    """封装基于富文本正文的 AI 编辑动作。"""

    def __init__(self, *, llm_provider: TextGenerationProvider) -> None:
        """装配 AI 编辑依赖。"""
        self.llm_provider = llm_provider

    async def edit(
        self,
        *,
        editor_document: dict,
        instruction: str,
        selection_text: str | None,
        target_block_id: str | None,
    ) -> tuple[dict, str]:
        """基于当前正文生成可直接应用的结构化 patch。"""
        normalized_document = normalize_editor_document(editor_document)
        document_text = extract_plain_text_from_document(normalized_document)
        normalized_selection = (selection_text or "").strip()
        generated_text = await self._generate_text(
            instruction=instruction,
            document_text=document_text,
            selection_text=normalized_selection,
        )

        if instruction == "title":
            heading_block = build_document_from_text(generated_text, block_type="heading")["blocks"][0]
            return (
                {
                    "op": "prepend_heading",
                    "block": heading_block,
                },
                generated_text,
            )

        if instruction == "script_seed":
            script_blocks = build_document_from_text(generated_text, block_type="paragraph")["blocks"]
            return (
                {
                    "op": "insert_after_selection",
                    "target_block_id": target_block_id,
                    "blocks": script_blocks,
                },
                generated_text,
            )

        return (
            {
                "op": "replace_selection",
                "target_block_id": target_block_id,
                "replacement_text": generated_text,
            },
            generated_text,
        )

    async def _generate_text(self, *, instruction: str, document_text: str, selection_text: str) -> str:
        """按编辑指令调用大模型并回退到最小安全输出。"""
        focus_text = selection_text or document_text
        if not focus_text.strip():
            return ""
        instruction_map = {
            "polish": "请润色这段内容，保留原意，让表达更顺滑。",
            "shorten": "请压缩这段内容，保留关键信息，输出更短的版本。",
            "expand": "请扩写这段内容，增加具体展开和表达层次。",
            "title": "请基于全文生成一句简短标题，不要带编号或引号。",
            "script_seed": "请把这段内容整理成适合后续口播脚本生成的草稿段落。",
        }
        system_prompt = "你是 SparkFlow 的内容编辑助手，只返回用户可直接粘贴到正文中的纯文本。"
        user_message = (
            f"编辑动作：{instruction_map.get(instruction, instruction)}\n\n"
            f"全文内容：\n{document_text.strip()}\n\n"
            f"重点处理内容：\n{focus_text.strip()}\n"
        )
        try:
            result = await self.llm_provider.generate(
                system_prompt=system_prompt,
                user_message=user_message,
                temperature=0.5,
                max_tokens=600,
            )
        except Exception:
            return focus_text.strip()
        return str(result or "").strip() or focus_text.strip()
