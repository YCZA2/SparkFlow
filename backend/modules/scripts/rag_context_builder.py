"""
RAG 脚本生成上下文拼装器。

将风格描述、检索示例、SOP 大纲、主题和可选碎片背景
组装成最终生成提示词，供 LLM 直接使用。
"""

from __future__ import annotations

from typing import Any


def _build_example_section(examples: list[str], section_label: str, item_label: str, max_count: int) -> str | None:
    """将示例列表拼装成带标题的提示词段落，无有效内容时返回 None。"""
    lines = []
    for i, content in enumerate(examples[:max_count], start=1):
        stripped = content.strip()
        if stripped:
            lines.append(f"{item_label}{i}：\n{stripped}")
    if not lines:
        return None
    return f"{section_label}\n" + "\n\n".join(lines)


def build_generation_prompt(
    *,
    topic: str,
    outline_json: str,
    style_description: str,
    reference_examples: list[str],
    high_like_examples: list[str],
    language_habit_examples: list[str],
    fragment_texts: list[str],
) -> str:
    """拼装 RAG 脚本生成的最终用户提示词。

    按照「风格描述→示例→大纲→主题→补充背景」的顺序排布，
    引导 LLM 在保持参考风格的同时严格遵循大纲结构输出脚本。
    """
    parts: list[str] = []

    if style_description:
        parts.append(f"[风格描述]\n{style_description}")

    for section in [
        _build_example_section(reference_examples, "[参考示例]", "示例", 3),
        _build_example_section(high_like_examples, "[高赞结构与表达参考]", "参考", 2),
        _build_example_section(language_habit_examples, "[语言习惯参考]", "习惯", 2),
    ]:
        if section:
            parts.append(section)

    if outline_json:
        parts.append(f"[内容大纲]\n{outline_json}")

    parts.append(f"[创作主题]\n{topic}")

    if fragment_texts:
        bg_text = "\n---\n".join(t for t in fragment_texts if t.strip())
        if bg_text:
            parts.append(f"[补充背景（来自用户碎片）]\n{bg_text}")

    return "\n\n".join(parts)


def build_generation_system_prompt() -> str:
    """返回 RAG 脚本生成的系统提示词。

    要求 LLM 严格按风格+大纲生成可直接用于口播的脚本正文。
    """
    return (
        "你是一位专业的短视频口播脚本创作者。\n"
        "请根据提供的风格描述、参考示例和内容大纲，围绕给定主题创作一篇完整的口播脚本。\n\n"
        "要求：\n"
        "1. 严格按照内容大纲的段落结构展开，每段之间有清晰过渡\n"
        "2. 模仿参考示例的写作风格，包括句式节奏、钩子方式和词汇风格\n"
        "3. 如有高赞结构参考，优先借鉴其信息组织与开场方式\n"
        "4. 如有语言习惯参考，尽量贴近对应的语气、措辞和表达偏好\n"
        "5. 语言自然流畅，适合口播朗读，避免书面化表达\n"
        "6. 脚本总字数控制在 400-800 字\n"
        "7. 如有补充背景，将相关知识点自然融入正文\n\n"
        "直接输出脚本正文，不需要标注段落名称或额外说明。"
    )
