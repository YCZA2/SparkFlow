"""RAG 脚本生成上下文拼装器。"""

from __future__ import annotations

from .writing_context import MethodologyPayload, StableCorePayload


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


def _build_methodology_section(methodologies: list[MethodologyPayload], max_count: int) -> str | None:
    """把方法论条目拼成独立上下文段落。"""
    lines: list[str] = []
    for index, item in enumerate(methodologies[:max_count], start=1):
        title = item.title.strip() if item.title else f"方法{index}"
        content = item.content.strip()
        if not content:
            continue
        lines.append(f"方法{index}（{title}）:\n{content}")
    if not lines:
        return None
    return "[方法论与 SOP]\n" + "\n\n".join(lines)


def _build_stable_core_section(stable_core: StableCorePayload) -> str | None:
    """把稳定内核画像规整成高优先级上下文。"""
    content = stable_core.content.strip()
    if not content:
        return None
    return f"[稳定内核]\n{content}"


def _build_related_materials_section(
    *,
    related_scripts: list[str],
    related_fragments: list[str],
    related_knowledge: list[str],
) -> str | None:
    """把本次主题相关的历史素材规整成统一段落。"""
    items = [item.strip() for item in [*related_scripts, *related_fragments, *related_knowledge] if item.strip()]
    if not items:
        return None
    return "[相关素材]\n" + "\n\n".join(items)


def build_generation_prompt(
    *,
    topic: str,
    outline_json: str,
    stable_core: StableCorePayload,
    methodologies: list[MethodologyPayload],
    related_scripts: list[str],
    related_fragments: list[str],
    related_knowledge: list[str],
    style_description: str,
    reference_examples: list[str],
    fragment_texts: list[str],
) -> str:
    """拼装 RAG 脚本生成的最终用户提示词。"""
    parts: list[str] = []

    for section in [
        _build_stable_core_section(stable_core),
        _build_methodology_section(methodologies, 5),
        _build_related_materials_section(
            related_scripts=related_scripts,
            related_fragments=related_fragments,
            related_knowledge=related_knowledge,
        ),
    ]:
        if section:
            parts.append(section)

    for section in [
        f"[风格描述]\n{style_description}" if style_description else None,
        _build_example_section(reference_examples, "[参考示例]", "示例", 3),
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
    """返回 RAG 脚本生成的系统提示词。"""
    return (
        "你是一位专业的短视频口播脚本创作者。\n"
        "请根据提供的稳定内核、方法论、相关素材、风格描述和内容大纲，围绕给定主题创作一篇完整的口播脚本。\n\n"
        "要求：\n"
        "1. 优先遵循稳定内核，保持价值观、母题、结构偏好和语言底色一致\n"
        "2. 如有方法论与 SOP，请优先采用其拆题和展开方式\n"
        "3. 如有相关素材，请只吸收与本次主题强相关的部分，不要机械拼接\n"
        "4. 如有风格描述和参考示例，请吸收其节奏、钩子方式和表达习惯\n"
        "5. 严格按照内容大纲的段落结构展开，每段之间有清晰过渡\n"
        "6. 语言自然流畅，适合口播朗读，避免书面化表达\n"
        "7. 脚本总字数控制在 400-800 字\n"
        "8. 如有补充背景，将相关知识点自然融入正文\n\n"
        "直接输出脚本正文，不需要标注段落名称或额外说明。"
    )
