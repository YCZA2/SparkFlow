"""三层写作上下文构建测试。"""

from __future__ import annotations

import pytest

from models import KnowledgeDoc
from modules.auth.application import TEST_USER_ID
from modules.shared.ports import KnowledgeChunk
from modules.scripts.writing_context_builder import (
    build_writing_context_bundle,
    refresh_fragment_methodology_entries_for_all_users,
)

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_writing_context_bundle_uses_preset_stable_core_and_cached_methodologies(app) -> None:
    """生成链路应使用预置稳定内核，并只读取已缓存的方法论。"""
    llm_provider = app.state.container.llm_provider
    vector_store = app.state.container.vector_store
    knowledge_index_store = app.state.container.knowledge_index_store

    from domains.fragments import repository as fragment_repository
    from domains.scripts import repository as script_repository
    from domains.writing_context import repository as writing_context_repository

    with app.state.container.session_factory() as db:
        fragment = fragment_repository.create(
            db=db,
            user_id=TEST_USER_ID,
            transcript=None,
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
            body_html="<p>我经常先用反常识开头，再给用户一个今天就能执行的动作。</p>",
            plain_text_snapshot="我经常先用反常识开头，再给用户一个今天就能执行的动作。",
            tags=[],
        )
        script_repository.create(
            db=db,
            user_id=TEST_USER_ID,
            title="时间管理旧脚本",
            body_html="<p>这是 AI 历史脚本里的特有表达：三秒抓眼球，时间管理最怕假努力。</p>",
            mode="mode_rag",
            source_fragment_ids="[]",
            status="ready",
        )
        knowledge_doc = KnowledgeDoc(
            user_id=TEST_USER_ID,
            title="长期方法资料",
            content="讲方法时先拆误区，再给三步动作。",
            body_markdown="讲方法时先拆误区，再给三步动作。",
            doc_type="high_likes",
            processing_status="ready",
            source_type="upload",
            chunk_count=1,
        )
        db.add(knowledge_doc)
        writing_context_repository.replace_methodology_entries_for_source(
            db=db,
            user_id=TEST_USER_ID,
            source_type="fragment_distilled",
            entries=[
                {
                    "title": "先拆误区",
                    "content": "先指出大家常见误区，再给替代做法。",
                    "source_ref_ids": f'["{fragment.id}"]',
                    "source_signature": "cached-signature",
                    "enabled": True,
                }
            ],
        )
        db.commit()
        db.refresh(knowledge_doc)
        fragment_id = fragment.id
        fragment_text = fragment.plain_text_snapshot
        fragment_source = fragment.source
        knowledge_doc_id = knowledge_doc.id
        knowledge_doc_title = knowledge_doc.title
        knowledge_doc_type = knowledge_doc.doc_type
        knowledge_doc_content = knowledge_doc.content

    await vector_store.upsert_fragment(
        user_id=TEST_USER_ID,
        fragment_id=fragment_id,
        text=fragment_text,
        source=fragment_source,
        summary=None,
        tags=None,
    )
    await knowledge_index_store.index_document(
        user_id=TEST_USER_ID,
        doc_id=knowledge_doc_id,
        title=knowledge_doc_title,
        doc_type=knowledge_doc_type,
        chunks=[KnowledgeChunk(chunk_index=0, content=knowledge_doc_content)],
    )

    with app.state.container.session_factory() as db:
        bundle = await build_writing_context_bundle(
            db=db,
            user_id=TEST_USER_ID,
            query_text="如何讲清时间管理误区",
            llm_provider=llm_provider,
            vector_store=vector_store,
            knowledge_index_store=knowledge_index_store,
            exclude_fragment_ids=[],
        )

    assert bundle.stable_core.content
    assert "把零散灵感整理成可执行" in bundle.stable_core.content
    assert any(item.source_type == "fragment_distilled" for item in bundle.methodologies)
    assert any(item.source_type == "knowledge_upload" for item in bundle.methodologies)
    assert bundle.related_scripts
    assert bundle.related_fragments
    assert bundle.related_knowledge
    assert llm_provider.calls == []


@pytest.mark.asyncio
async def test_daily_writing_context_maintenance_refreshes_only_after_threshold(app) -> None:
    """每日维护任务应在碎片数量和增量达标后才静默刷新方法论。"""
    llm_provider = app.state.container.llm_provider

    from domains.fragments import repository as fragment_repository
    from domains.writing_context import repository as writing_context_repository

    with app.state.container.session_factory() as db:
        for index in range(7):
            fragment_repository.create(
                db=db,
                user_id=TEST_USER_ID,
                transcript=None,
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
                body_html=f"<p>首轮阈值碎片 {index}</p>",
                plain_text_snapshot=f"首轮阈值碎片 {index}",
                tags=[],
            )

        first_result = await refresh_fragment_methodology_entries_for_all_users(
            db=db,
            llm_provider=llm_provider,
        )
        first_entries = writing_context_repository.list_methodology_entries_by_source_type(
            db=db,
            user_id=TEST_USER_ID,
            source_type="fragment_distilled",
        )

        fragment_repository.create(
            db=db,
            user_id=TEST_USER_ID,
            transcript=None,
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
            body_html="<p>第八条碎片，达到阈值</p>",
            plain_text_snapshot="第八条碎片，达到阈值",
            tags=[],
        )
        llm_provider.queue_text('[{"title":"首轮方法论","content":"先抛问题，再给动作。"}]')
        second_result = await refresh_fragment_methodology_entries_for_all_users(
            db=db,
            llm_provider=llm_provider,
        )
        second_entries = writing_context_repository.list_methodology_entries_by_source_type(
            db=db,
            user_id=TEST_USER_ID,
            source_type="fragment_distilled",
        )
        second_signature = second_entries[0].source_signature

        for index in range(2):
            fragment_repository.create(
                db=db,
                user_id=TEST_USER_ID,
                transcript=None,
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
                body_html=f"<p>增量未达标 {index}</p>",
                plain_text_snapshot=f"增量未达标 {index}",
                tags=[],
            )
        third_result = await refresh_fragment_methodology_entries_for_all_users(
            db=db,
            llm_provider=llm_provider,
        )
        third_entries = writing_context_repository.list_methodology_entries_by_source_type(
            db=db,
            user_id=TEST_USER_ID,
            source_type="fragment_distilled",
        )

    assert first_result["refreshed_user_ids"] == []
    assert first_entries == []
    assert second_result["refreshed_user_ids"] == [TEST_USER_ID]
    assert len(second_entries) == 1
    assert second_entries[0].title == "首轮方法论"
    assert third_result["refreshed_user_ids"] == []
    assert len(third_entries) == 1
    assert third_entries[0].source_signature == second_signature
