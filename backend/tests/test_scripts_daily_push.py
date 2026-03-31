"""每日推盘碎片筛选测试。"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from core.exceptions import ValidationError
from modules.scripts.daily_push import DailyPushFragmentSelector, build_fragments_text


def _build_fragment(fragment_id: str, transcript: str) -> SimpleNamespace:
    """构造符合 snapshot 语义的每日推盘碎片替身。"""
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id=fragment_id,
        created_at=now,
        plain_text_snapshot=transcript,
        body_html=f"<p>{transcript}</p>",
        transcript=transcript,
        summary=None,
    )


class StubVectorStore:
    """提供可编排碎片相似度结果的向量库替身。"""

    def __init__(self, mapping: dict[str, list[dict[str, object]]]) -> None:
        """保存每个查询词对应的命中结果。"""
        self.mapping = mapping

    async def query_fragments(self, *, user_id: str, query_text: str, top_k: int, exclude_ids=None):
        """按查询词返回预设命中结果。"""
        return self.mapping.get(query_text, [])[:top_k]


@pytest.mark.asyncio
async def test_daily_push_selector_returns_largest_component() -> None:
    """碎片筛选应返回最大连通分量对应的碎片集合。"""
    f1 = _build_fragment("topic-a-1", "topic a one")
    f2 = _build_fragment("topic-a-2", "topic a two")
    f3 = _build_fragment("topic-a-3", "topic a three")
    other_1 = _build_fragment("topic-b-1", "topic b one")
    other_2 = _build_fragment("topic-b-2", "topic b two")

    selector = DailyPushFragmentSelector(
        vector_store=StubVectorStore(
            {
                "topic a one": [{"fragment_id": f2.id, "score": 0.9}, {"fragment_id": f3.id, "score": 0.88}],
                "topic a two": [{"fragment_id": f1.id, "score": 0.9}, {"fragment_id": f3.id, "score": 0.89}],
                "topic a three": [{"fragment_id": f1.id, "score": 0.88}, {"fragment_id": f2.id, "score": 0.89}],
                "topic b one": [{"fragment_id": other_1.id, "score": 0.2}],
                "topic b two": [{"fragment_id": other_2.id, "score": 0.2}],
            }
        )
    )

    selected = await selector.select_related_fragments(
        user_id="test-user-001",
        fragments=[f1, f2, f3, other_1, other_2],
    )

    assert {fragment.id for fragment in selected} == {f1.id, f2.id, f3.id}


@pytest.mark.asyncio
async def test_daily_push_selector_returns_empty_when_candidates_below_minimum() -> None:
    """候选碎片不足最小阈值时应直接返回空集合。"""
    selector = DailyPushFragmentSelector(vector_store=StubVectorStore({}))

    selected = await selector.select_related_fragments(
        user_id="test-user-001",
        fragments=[_build_fragment("only-1", "only-one"), _build_fragment("only-2", "only-two")],
    )

    assert selected == []


def test_build_fragments_text_requires_available_content() -> None:
    """文本拼接应拒绝没有可用正文快照的输入。"""
    with pytest.raises(ValidationError):
        build_fragments_text([SimpleNamespace(transcript=None, plain_text_snapshot="", body_html="")])
