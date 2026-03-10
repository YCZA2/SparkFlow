from __future__ import annotations

from math import ceil

from core.config import settings
from core.exceptions import ValidationError
from models import Fragment
from modules.shared.content_markdown import compile_fragment_markdown, extract_plain_text
from modules.shared.ports import VectorStore


def build_fragments_text(fragments: list[Fragment]) -> str:
    """拼接脚本生成所需的碎片文本。"""
    parts = [read_fragment_content(fragment) for fragment in fragments if read_fragment_content(fragment)]
    if not parts:
        raise ValidationError(message="选中的碎片均无转写内容，无法生成口播稿", field_errors={"fragment_ids": "碎片内容为空"})
    return "\n\n---\n\n".join(parts)


class DailyPushFragmentSelector:
    """封装每日推盘使用的碎片筛选规则。"""

    def __init__(self, *, vector_store: VectorStore) -> None:
        """装配碎片相似度检索依赖。"""
        self.vector_store = vector_store

    async def select_related_fragments(self, *, user_id: str, fragments: list[Fragment]) -> list[Fragment]:
        """基于向量相似度选出同主题碎片。"""
        candidate_ids = {fragment.id for fragment in fragments if read_fragment_content(fragment)}
        if len(candidate_ids) < settings.DAILY_PUSH_MIN_FRAGMENTS:
            return []
        adjacency: dict[str, set[str]] = {fragment.id: set() for fragment in fragments}
        top_k = max(5, ceil(len(fragments) * 1.5))
        for fragment in fragments:
            query_text = read_fragment_content(fragment) or fragment.summary or ""
            if not query_text.strip():
                continue
            try:
                matches = await self.vector_store.query_fragments(
                    user_id=user_id,
                    query_text=query_text,
                    top_k=top_k,
                    exclude_ids=[fragment.id],
                )
            except Exception:
                continue
            for match in matches:
                matched_id = match.get("fragment_id")
                score = float(match.get("score") or 0.0)
                if matched_id in candidate_ids and score >= settings.DAILY_PUSH_SIMILARITY_THRESHOLD:
                    adjacency.setdefault(fragment.id, set()).add(matched_id)
                    adjacency.setdefault(matched_id, set()).add(fragment.id)
        largest_component = _largest_connected_component(adjacency=adjacency, fragment_ids=candidate_ids)
        fragment_map = {fragment.id: fragment for fragment in fragments}
        selected = [fragment_map[fragment_id] for fragment_id in largest_component if fragment_id in fragment_map]
        return sorted(selected, key=lambda fragment: fragment.created_at)


def _largest_connected_component(*, adjacency: dict[str, set[str]], fragment_ids: set[str]) -> list[str]:
    """返回候选碎片图中的最大连通分量。"""
    visited: set[str] = set()
    best_component: list[str] = []
    for fragment_id in fragment_ids:
        if fragment_id in visited:
            continue
        stack = [fragment_id]
        component: list[str] = []
        while stack:
            current = stack.pop()
            if current in visited:
                continue
            visited.add(current)
            component.append(current)
            stack.extend(neighbor for neighbor in adjacency.get(current, set()) if neighbor not in visited)
        if len(component) > len(best_component):
            best_component = component
    return best_component


def read_fragment_content(fragment: Fragment) -> str:
    """统一读取每日推盘使用的碎片正文。"""
    if fragment.blocks:
        markdown = compile_fragment_markdown(
            block_payloads=[block.payload_json for block in sorted(fragment.blocks, key=lambda item: item.order_index)],
        )
        return extract_plain_text(markdown)
    return ""
