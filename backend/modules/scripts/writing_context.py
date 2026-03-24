"""脚本生成三层写作上下文对象。"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class StableCorePayload:
    """描述用户稳定内核画像。"""

    content: str = ""
    source_summary: str = ""


@dataclass
class MethodologyPayload:
    """描述单条方法论条目。"""

    title: str = ""
    content: str = ""
    source_type: str = ""


@dataclass
class WritingContextBundle:
    """描述脚本生成前可消费的三层写作上下文。"""

    stable_core: StableCorePayload = field(default_factory=StableCorePayload)
    methodologies: list[MethodologyPayload] = field(default_factory=list)
    related_scripts: list[str] = field(default_factory=list)
    related_fragments: list[str] = field(default_factory=list)
    related_knowledge: list[str] = field(default_factory=list)
