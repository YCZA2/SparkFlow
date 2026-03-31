"""三层写作上下文构建测试。"""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

import pytest

from domains.backups import repository as backup_repository
from models import KnowledgeDoc
from modules.auth.application import TEST_USER_ID
from modules.shared.ports import KnowledgeChunk
from modules.scripts.writing_context_builder import (
    build_writing_context_bundle,
    refresh_fragment_methodology_entries_for_all_users,
)

pytestmark = pytest.mark.integration


def _upsert_fragment_snapshot(db, fragment) -> None:
    """把测试碎片同步成 backup snapshot，模拟 local-first 已完成 flush。"""
    backup_repository.upsert_record(
        db=db,
        user_id=TEST_USER_ID,
        entity_type="fragment",
        entity_id=fragment.id,
        entity_version=1,
        operation="upsert",
        payload_json=json.dumps(
            {
                "id": fragment.id,
                "folder_id": fragment.folder_id,
                "source": fragment.source,
                "audio_source": fragment.audio_source,
                "created_at": fragment.created_at.isoformat(),
                "updated_at": fragment.updated_at.isoformat(),
                "summary": fragment.summary,
                "tags": [],
                "transcript": fragment.transcript,
                "body_html": fragment.body_html or "",
                "plain_text_snapshot": fragment.plain_text_snapshot or "",
                "deleted_at": None,
            },
            ensure_ascii=False,
        ),
        modified_at=fragment.updated_at,
        last_modified_device_id="device-test",
        now=fragment.updated_at,
    )


def _build_fragment_snapshot(*, fragment_id: str, text: str, offset_minutes: int = 0):
    """构造写作上下文测试使用的 fragment snapshot 替身。"""
    created_at = datetime.now(timezone.utc) + timedelta(minutes=offset_minutes)
    return type(
        "SnapshotSeed",
        (),
        {
            "id": fragment_id,
            "user_id": TEST_USER_ID,
            "folder_id": None,
            "source": "manual",
            "audio_source": None,
            "created_at": created_at,
            "updated_at": created_at,
            "summary": None,
            "transcript": None,
            "body_html": f"<p>{text}</p>",
            "plain_text_snapshot": text,
        },
    )()


@pytest.mark.asyncio
async def test_writing_context_bundle_uses_preset_stable_core_and_cached_methodologies(app) -> None:
    """生成链路应使用预置稳定内核，并只读取已缓存的方法论。"""
    llm_provider = app.state.container.llm_provider
    vector_store = app.state.container.vector_store
    knowledge_index_store = app.state.container.knowledge_index_store

    from domains.scripts import repository as script_repository
    from domains.writing_context import repository as writing_context_repository

    with app.state.container.session_factory() as db:
        fragment = _build_fragment_snapshot(
            fragment_id="writing-context-fragment-001",
            text="我经常先用反常识开头，再给用户一个今天就能执行的动作。",
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
        _upsert_fragment_snapshot(db, fragment)
        db.commit()

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

    from domains.writing_context import repository as writing_context_repository

    with app.state.container.session_factory() as db:
        for index in range(7):
            fragment = _build_fragment_snapshot(
                fragment_id=f"writing-threshold-fragment-{index}",
                text=f"首轮阈值碎片 {index}",
                offset_minutes=index,
            )
            _upsert_fragment_snapshot(db, fragment)

        first_result = await refresh_fragment_methodology_entries_for_all_users(
            db=db,
            llm_provider=llm_provider,
        )
        first_entries = writing_context_repository.list_methodology_entries_by_source_type(
            db=db,
            user_id=TEST_USER_ID,
            source_type="fragment_distilled",
        )

        fragment = _build_fragment_snapshot(
            fragment_id="writing-threshold-fragment-8",
            text="第八条碎片，达到阈值",
            offset_minutes=8,
        )
        _upsert_fragment_snapshot(db, fragment)
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
            fragment = _build_fragment_snapshot(
                fragment_id=f"writing-threshold-fragment-extra-{index}",
                text=f"增量未达标 {index}",
                offset_minutes=10 + index,
            )
            _upsert_fragment_snapshot(db, fragment)
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
