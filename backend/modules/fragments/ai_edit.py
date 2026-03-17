from __future__ import annotations

from modules.shared.content.fragment_body_markdown import (
    extract_plain_text_from_body_markdown,
    normalize_fragment_body_markdown,
)
from modules.shared.ports import TextGenerationProvider


class FragmentAiEditService:
    """封装基于 Markdown 正文的 AI 编辑动作。"""

    def __init__(self, *, llm_provider: TextGenerationProvider) -> None:
        """装配 AI 编辑依赖。"""
        self.llm_provider = llm_provider

    async def edit(
        self,
        *,
        body_markdown: str,
        instruction: str,
        selection_text: str | None,
    ) -> tuple[dict, str]:
        """基于当前正文生成可直接应用的 Markdown patch。"""
        normalized_body_markdown = normalize_fragment_body_markdown(body_markdown)
        document_text = extract_plain_text_from_body_markdown(normalized_body_markdown)
        normalized_selection = (selection_text or "").strip()
        generated_text = await self._generate_text(
            instruction=instruction,
            document_text=document_text,
            selection_text=normalized_selection,
        )

        if instruction == "title":
            return (
                {
                    "op": "prepend_document",
                    "markdown_snippet": f"# {generated_text}".strip(),
                },
                generated_text,
            )

        if instruction == "script_seed":
            return (
                {
                    "op": "insert_after_selection",
                    "markdown_snippet": generated_text.strip(),
                },
                generated_text,
            )

        return (
            {
                "op": "replace_selection",
                "markdown_snippet": generated_text.strip(),
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
        system_prompt = "你是 SparkFlow 的内容编辑助手，只返回用户可直接粘贴到正文中的 Markdown 片段或纯文本。"
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
