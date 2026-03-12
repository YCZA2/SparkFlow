"""脚本上下文构建测试。"""

from __future__ import annotations

import pytest

from core.exceptions import ValidationError
from domains.fragments import repository as fragment_repository
from domains.knowledge import repository as knowledge_repository
from modules.auth.application import TEST_USER_ID
from modules.scripts.context_builder import ScriptGenerationContextBuilder
from tests.support import FakeVectorStore, FakeWebSearchProvider

pytestmark = pytest.mark.integration


def _create_fragment(db, transcript: str):
    """创建供上下文构建测试使用的碎片。"""
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
        body_html=f"<p>{transcript}</p>",
        plain_text_snapshot=transcript,
    )
    return fragment_repository.get_by_id(db=db, user_id=TEST_USER_ID, fragment_id=fragment.id)


@pytest.mark.asyncio
async def test_context_builder_builds_context_with_research_hits(db_session_factory) -> None:
    """上下文构建器应聚合碎片、知识库和网页搜索结果。"""
    vector_store = FakeVectorStore()
    web_search_provider = FakeWebSearchProvider()
    builder = ScriptGenerationContextBuilder(vector_store=vector_store, web_search_provider=web_search_provider)

    with db_session_factory() as db:
        fragment = _create_fragment(db, "关于定位的一条碎片")
        knowledge_doc = knowledge_repository.create(
            db=db,
            user_id=TEST_USER_ID,
            title="定位文档",
            content="关于定位的经验",
            body_markdown="关于定位的经验",
            doc_type="high_likes",
        )
        vector_store.knowledge_results = [{"doc_id": knowledge_doc.id, "score": 0.91}]

        fragments = builder.validate_fragments(
            db=db,
            user_id=TEST_USER_ID,
            fragment_ids=[fragment.id],
            mode="mode_a",
        )
        context = await builder.build_context(
            db=db,
            user_id=TEST_USER_ID,
            fragments=fragments,
            mode="mode_a",
            query_hint="写一篇关于定位的口播稿",
            include_web_search=True,
        )

    assert context.query_hint == "写一篇关于定位的口播稿"
    assert context.selected_fragments[0]["transcript"] == "关于定位的一条碎片"
    assert context.knowledge_hits[0]["title"] == "定位文档"
    assert context.web_hits[0]["url"] == "https://example.com"
    assert context.generation_metadata["query_text_preview"] == "写一篇关于定位的口播稿"[:120]
    assert web_search_provider.calls == ["写一篇关于定位的口播稿"]


def test_context_builder_validate_fragments_rejects_invalid_mode(db_session_factory) -> None:
    """上下文构建器应拒绝非法生成模式。"""
    builder = ScriptGenerationContextBuilder(
        vector_store=FakeVectorStore(),
        web_search_provider=FakeWebSearchProvider(),
    )

    with db_session_factory() as db:
        fragment = _create_fragment(db, "一条可用碎片")

        with pytest.raises(ValidationError) as exc_info:
            builder.validate_fragments(
                db=db,
                user_id=TEST_USER_ID,
                fragment_ids=[fragment.id],
                mode="invalid_mode",
            )

    assert "无效的生成模式" in str(exc_info.value)
    assert exc_info.value.details["mode"] == "必须是 mode_a 或 mode_b"


def test_context_builder_build_query_text_uses_fragment_plain_text_snapshot(db_session_factory) -> None:
    """查询词缺省时应基于碎片正文快照生成。"""
    builder = ScriptGenerationContextBuilder(
        vector_store=FakeVectorStore(),
        web_search_provider=FakeWebSearchProvider(),
    )

    with db_session_factory() as db:
        fragment = _create_fragment(db, "第一条碎片")
        query_text = builder.build_query_text(fragments=[fragment], query_hint=None)

    assert query_text == "第一条碎片"
