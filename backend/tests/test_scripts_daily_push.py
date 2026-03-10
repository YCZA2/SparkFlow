"""每日推盘碎片筛选测试。"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from core.exceptions import ValidationError
from domains.fragment_blocks import repository as fragment_block_repository
from domains.fragments import repository as fragment_repository
from modules.auth.application import TEST_USER_ID
from modules.shared.content_markdown import build_markdown_block_payload
from modules.scripts.daily_push import DailyPushFragmentSelector, build_fragments_text


def _create_fragment(db, transcript: str):
    """创建供每日推盘测试使用的碎片。"""
    fragment = fragment_repository.create(
        db=db,
        user_id=TEST_USER_ID,
        transcript=transcript,
        source="manual",
        audio_source=None,
        audio_storage_provider=None,
        audio_bucket=None,
        audio_object_key=None,
        audio_access_level=None,
        audio_original_filename=None,
        audio_mime_type=None,
        audio_file_size=None,
        audio_checksum=None,
    )
    fragment_block_repository.create_markdown_block(
        db=db,
        fragment_id=fragment.id,
        order_index=0,
        payload_json=build_markdown_block_payload(transcript),
    )
    return fragment_repository.get_by_id(db=db, user_id=TEST_USER_ID, fragment_id=fragment.id)


class StubVectorStore:
    """提供可编排碎片相似度结果的向量库替身。"""

    def __init__(self, mapping: dict[str, list[dict[str, object]]]) -> None:
        """保存每个查询词对应的命中结果。"""
        self.mapping = mapping

    async def query_fragments(self, *, user_id: str, query_text: str, top_k: int, exclude_ids=None):
        """按查询词返回预设命中结果。"""
        return self.mapping.get(query_text, [])[:top_k]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_daily_push_selector_returns_largest_component(db_session_factory) -> None:
    """碎片筛选应返回最大连通分量对应的碎片集合。"""
    with db_session_factory() as db:
        f1 = _create_fragment(db, "topic a one")
        f2 = _create_fragment(db, "topic a two")
        f3 = _create_fragment(db, "topic a three")
        _create_fragment(db, "topic b one")
        _create_fragment(db, "topic b two")

        selector = DailyPushFragmentSelector(
                vector_store=StubVectorStore(
                    {
                        "topic a one": [{"fragment_id": f2.id, "score": 0.9}, {"fragment_id": f3.id, "score": 0.88}],
                        "topic a two": [{"fragment_id": f1.id, "score": 0.9}, {"fragment_id": f3.id, "score": 0.89}],
                        "topic a three": [{"fragment_id": f1.id, "score": 0.88}, {"fragment_id": f2.id, "score": 0.89}],
                        "topic b one": [{"fragment_id": "other-1", "score": 0.9}],
                        "topic b two": [{"fragment_id": "other-2", "score": 0.9}],
                    }
                )
            )

        selected = await selector.select_related_fragments(
            user_id=TEST_USER_ID,
            fragments=fragment_repository.list_by_user(db=db, user_id=TEST_USER_ID, limit=10, offset=0),
        )

    assert {fragment.id for fragment in selected} == {f1.id, f2.id, f3.id}


@pytest.mark.asyncio
@pytest.mark.integration
async def test_daily_push_selector_returns_empty_when_candidates_below_minimum(db_session_factory) -> None:
    """候选碎片不足最小阈值时应直接返回空集合。"""
    with db_session_factory() as db:
        _create_fragment(db, "only-one")
        _create_fragment(db, "only-two")
        selector = DailyPushFragmentSelector(vector_store=StubVectorStore({}))

        selected = await selector.select_related_fragments(
            user_id=TEST_USER_ID,
            fragments=fragment_repository.list_by_user(db=db, user_id=TEST_USER_ID, limit=10, offset=0),
        )

    assert selected == []


def test_build_fragments_text_requires_available_content() -> None:
    """文本拼接应拒绝没有正文块的输入。"""
    with pytest.raises(ValidationError):
        build_fragments_text([SimpleNamespace(transcript=None, blocks=[])])
