"""RAG 脚本生成上下文拼装器。"""

from __future__ import annotations

from pathlib import Path

from modules.shared.prompt_loader import load_prompt_text

from .writing_context import MethodologyPayload, StableCorePayload

_RAG_GENERATION_SYSTEM_PROMPT_PATH = Path(__file__).parent.parent.parent / "prompts" / "rag_generation_system.txt"


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
    return load_prompt_text(_RAG_GENERATION_SYSTEM_PROMPT_PATH)
