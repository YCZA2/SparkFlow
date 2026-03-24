"""三层写作上下文构建测试。"""

from __future__ import annotations

import json

import pytest

from models import KnowledgeDoc
from modules.auth.application import TEST_USER_ID
from modules.shared.ports import KnowledgeChunk
from modules.scripts.writing_context_builder import build_writing_context_bundle

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_writing_context_bundle_builds_three_layers_and_excludes_scripts_from_stable_core(app) -> None:
    """稳定内核只应吸收碎片和长期资料，不应把历史脚本当作真值来源。"""
    llm_provider = app.state.container.llm_provider
    vector_store = app.state.container.vector_store
    knowledge_index_store = app.state.container.knowledge_index_store
    captured_calls: list[dict] = []

    from domains.fragments import repository as fragment_repository
    from domains.scripts import repository as script_repository

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

    async def fake_generate(**kwargs):
        captured_calls.append(kwargs)
        system_prompt = kwargs.get("system_prompt", "")
        if "稳定内核画像" in system_prompt:
            return "价值观：强调真诚和执行。\n核心母题：把复杂问题讲简单。\n结构偏好：先破后立。\n语言底色：直接、口语化。\n表达立场：提醒式。"
        if "方法论提炼助手" in system_prompt:
            return json.dumps(
                [
                    {
                        "title": "先拆误区",
                        "content": "先指出大家常见误区，再给替代做法。",
                    }
                ],
                ensure_ascii=False,
            )
        return "unused"

    original_generate = llm_provider.generate
    llm_provider.generate = fake_generate

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

    llm_provider.generate = original_generate

    assert bundle.stable_core.content
    assert any(item.source_type == "fragment_distilled" for item in bundle.methodologies)
    assert any(item.source_type == "knowledge_upload" for item in bundle.methodologies)
    assert bundle.related_scripts
    assert bundle.related_fragments
    assert bundle.related_knowledge

    stable_core_call = next(call for call in captured_calls if "稳定内核画像" in call.get("system_prompt", ""))
    assert "我经常先用反常识开头" in stable_core_call["user_message"]
    assert "讲方法时先拆误区" in stable_core_call["user_message"]
    assert "这是 AI 历史脚本里的特有表达" not in stable_core_call["user_message"]
