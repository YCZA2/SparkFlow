"""RAG 脚本生成 pipeline 任务态测试。"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from domains.backups import repository as backup_repository
from models import KnowledgeDoc
from modules.auth.application import TEST_USER_ID
from modules.shared.ports import KnowledgeChunk

pytestmark = pytest.mark.integration


async def _auth_headers(async_client, auth_headers_factory) -> dict[str, str]:
    """生成脚本 pipeline 测试使用的鉴权请求头。"""
    return await auth_headers_factory(async_client)


async def _create_fragment(async_client, auth_headers_factory, transcript: str) -> str:
    """构造一条仅存在于 snapshot 的测试碎片 ID。"""
    return str(uuid4())


async def _create_fragment_payload(async_client, auth_headers_factory, transcript: str) -> dict:
    """构造可直接同步到 snapshot 的手动碎片载荷。"""
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    fragment_id = str(uuid4())
    return {
        "id": fragment_id,
        "folder_id": None,
        "source": "manual",
        "audio_source": None,
        "created_at": now,
        "updated_at": now,
        "summary": None,
        "tags": [],
        "transcript": None,
        "body_html": f"<p>{transcript}</p>",
        "plain_text_snapshot": transcript,
        "deleted_at": None,
    }


def _upsert_fragment_snapshot(db, payload: dict) -> None:
    """把测试碎片同步成远端 snapshot，模拟 local-first flush 完成。"""
    backup_repository.upsert_record(
        db=db,
        user_id=TEST_USER_ID,
        entity_type="fragment",
        entity_id=payload["id"],
        entity_version=1,
        operation="upsert",
        payload_json=json.dumps(
            {
                "id": payload["id"],
                "folder_id": payload.get("folder_id"),
                "source": payload.get("source") or "manual",
                "audio_source": payload.get("audio_source"),
                "created_at": payload["created_at"],
                "updated_at": payload["updated_at"],
                "summary": payload.get("summary"),
                "tags": payload.get("tags") or [],
                "transcript": payload.get("transcript"),
                "body_html": payload.get("body_html") or "",
                "plain_text_snapshot": payload.get("plain_text_snapshot") or "",
                "deleted_at": payload.get("deleted_at"),
            },
            ensure_ascii=False,
        ),
        modified_at=None,
        last_modified_device_id="device-test",
        now=datetime.fromisoformat(payload["updated_at"].replace("Z", "+00:00")),
    )


async def _wait_task(async_client, auth_headers_factory, task_id: str, *, attempts: int = 40) -> dict:
    """轮询直到任务进入终态。"""
    headers = await _auth_headers(async_client, auth_headers_factory)
    for _ in range(attempts):
        response = await async_client.get(f"/api/tasks/{task_id}", headers=headers)
        assert response.status_code == 200
        payload = response.json()["data"]
        if payload["status"] in {"succeeded", "failed", "cancelled"}:
            return payload
        await asyncio.sleep(0.05)
    raise AssertionError(f"task {task_id} did not finish")


@pytest.mark.asyncio
async def test_rag_script_generation_task_runs_and_persists_script(
    async_client,
    auth_headers_factory,
    app,
) -> None:
    """RAG 脚本生成应经过全部步骤，并在成功后写入 script 记录。"""
    # LLM 替身按调用顺序返回：大纲 JSON → 脚本草稿
    llm_provider = app.state.container.llm_provider
    call_index = 0
    original_generate = llm_provider.generate

    async def multi_generate(**kwargs):
        nonlocal call_index
        responses = [
            '{"sop_type":"爆款结构","sections":[{"name":"钩子","key_points":["吸引眼球"]}]}',
            "这是通过 RAG 生成的口播稿正文",
        ]
        text = responses[call_index] if call_index < len(responses) else "补充生成内容"
        call_index += 1
        return text

    llm_provider.generate = multi_generate

    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"topic": "如何坚持早起"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_response.status_code == 201
    payload = create_response.json()["data"]
    assert payload["task_type"] == "rag_script_generation"

    task = await _wait_task(async_client, auth_headers_factory, payload["task_id"])
    assert task["status"] == "succeeded"
    assert task["resource"]["resource_type"] == "script"

    detail_response = await async_client.get(
        f"/api/scripts/{task['resource']['resource_id']}",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert detail_response.status_code == 200
    script_data = detail_response.json()["data"]
    assert "RAG" in script_data["body_html"]
    assert script_data["mode"] == "mode_rag"
    assert script_data["source_fragment_ids"] == []
    assert script_data["source_fragment_count"] == 0

    # 恢复 LLM 替身
    llm_provider.generate = original_generate


@pytest.mark.asyncio
async def test_rag_script_generation_with_optional_fragments(
    async_client,
    auth_headers_factory,
    app,
    db_session_factory,
) -> None:
    """带可选碎片的 RAG 生成应正常完成并写入 script 记录。"""
    fragment = await _create_fragment_payload(async_client, auth_headers_factory, "关于早起习惯的碎片背景")
    with db_session_factory() as db:
        _upsert_fragment_snapshot(db, fragment)
        db.commit()
    llm_provider = app.state.container.llm_provider

    async def multi_generate(**kwargs):
        system_prompt = kwargs.get("system_prompt", "")
        if "SOP" in system_prompt:
            return '{"sop_type":"教育结构","sections":[{"name":"引入","key_points":["问题开场"]}]}'
        return "这是含碎片背景的口播稿正文"

    original_generate = llm_provider.generate
    llm_provider.generate = multi_generate

    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"topic": "早起的好处", "fragment_ids": [fragment["id"]]},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_response.status_code == 201
    task = await _wait_task(async_client, auth_headers_factory, create_response.json()["data"]["task_id"])
    assert task["status"] == "succeeded"

    llm_provider.generate = original_generate


@pytest.mark.asyncio
async def test_rag_script_generation_missing_topic_returns_validation_error(
    async_client,
    auth_headers_factory,
) -> None:
    """缺少 topic 字段时应返回 422 验证错误。"""
    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"fragment_ids": []},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_response.status_code == 422


@pytest.mark.asyncio
async def test_rag_script_generation_pipeline_fails_when_llm_returns_empty_draft(
    async_client,
    auth_headers_factory,
    app,
) -> None:
    """LLM 返回空草稿时 pipeline 应标记为失败。"""
    llm_provider = app.state.container.llm_provider
    call_index = 0

    async def multi_generate(**kwargs):
        nonlocal call_index
        # 大纲正常返回，草稿返回空字符串
        responses = ['{"sop_type":"爆款","sections":[]}', ""]
        text = responses[call_index] if call_index < len(responses) else ""
        call_index += 1
        return text

    original_generate = llm_provider.generate
    llm_provider.generate = multi_generate

    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"topic": "健康饮食"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_response.status_code == 201

    task = await _wait_task(async_client, auth_headers_factory, create_response.json()["data"]["task_id"])
    assert task["status"] == "failed"

    llm_provider.generate = original_generate


@pytest.mark.asyncio
async def test_rag_script_generation_includes_knowledge_context_sections(
    async_client,
    auth_headers_factory,
    app,
    db_session_factory,
) -> None:
    """三层上下文命中应进入最终脚本生成提示词。"""
    llm_provider = app.state.container.llm_provider
    original_generate = llm_provider.generate
    captured_user_messages: list[str] = []

    with app.state.container.session_factory() as db:
        from domains.writing_context import repository as writing_context_repository

        reference_doc = KnowledgeDoc(
            user_id=TEST_USER_ID,
            title="参考脚本",
            content="三秒内先抛冲突，再给结论。",
            body_markdown="三秒内先抛冲突，再给结论。",
            doc_type="reference_script",
            processing_status="ready",
            style_description="快节奏、强钩子、结论前置",
            source_type="manual",
            chunk_count=1,
        )
        high_like_doc = KnowledgeDoc(
            user_id=TEST_USER_ID,
            title="高赞案例",
            content="开场先抛反常识，再给方法三步走。",
            body_markdown="开场先抛反常识，再给方法三步走。",
            doc_type="high_likes",
            processing_status="ready",
            source_type="manual",
            chunk_count=1,
        )
        habit_doc = KnowledgeDoc(
            user_id=TEST_USER_ID,
            title="语言习惯",
            content="多用你、我、现在，少用抽象名词。",
            body_markdown="多用你、我、现在，少用抽象名词。",
            doc_type="language_habit",
            processing_status="ready",
            source_type="manual",
            chunk_count=1,
        )
        db.add_all([reference_doc, high_like_doc, habit_doc])
        writing_context_repository.replace_methodology_entries_for_source(
            db=db,
            user_id=TEST_USER_ID,
            source_type="fragment_distilled",
            entries=[
                {
                    "title": "先抛反常识",
                    "content": "开头先给反直觉判断，再展开解释。",
                    "source_ref_ids": "[]",
                    "source_signature": "cached-signature",
                    "enabled": True,
                }
            ],
        )
        db.commit()
        db.refresh(reference_doc)
        db.refresh(high_like_doc)
        db.refresh(habit_doc)

    fragment = await _create_fragment_payload(async_client, auth_headers_factory, "我一贯喜欢先讲反常识，再拆解误区和动作。")
    with db_session_factory() as db:
        _upsert_fragment_snapshot(db, fragment)
        db.commit()

    await app.state.container.knowledge_index_store.index_document(
        user_id=TEST_USER_ID,
        doc_id=reference_doc.id,
        title=reference_doc.title,
        doc_type=reference_doc.doc_type,
        chunks=[KnowledgeChunk(chunk_index=0, content=reference_doc.content)],
    )
    await app.state.container.knowledge_index_store.index_document(
        user_id=TEST_USER_ID,
        doc_id=high_like_doc.id,
        title=high_like_doc.title,
        doc_type=high_like_doc.doc_type,
        chunks=[KnowledgeChunk(chunk_index=0, content=high_like_doc.content)],
    )
    await app.state.container.knowledge_index_store.index_document(
        user_id=TEST_USER_ID,
        doc_id=habit_doc.id,
        title=habit_doc.title,
        doc_type=habit_doc.doc_type,
        chunks=[KnowledgeChunk(chunk_index=0, content=habit_doc.content)],
    )

    async def multi_generate(**kwargs):
        system_prompt = kwargs.get("system_prompt", "")
        captured_user_messages.append(kwargs.get("user_message", ""))
        if "SOP" in system_prompt:
            return '{"sop_type":"知识结构","sections":[{"name":"开场","key_points":["反常识"]}]}'
        return "这是融合三层上下文后的口播稿正文"

    llm_provider.generate = multi_generate

    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"topic": "如何讲清一个复杂概念", "fragment_ids": [fragment["id"]]},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_response.status_code == 201

    task = await _wait_task(async_client, auth_headers_factory, create_response.json()["data"]["task_id"])
    assert task["status"] == "succeeded"

    final_prompt = captured_user_messages[-1]
    assert "[稳定内核]" in final_prompt
    assert "[方法论与 SOP]" in final_prompt
    assert "[相关素材]" in final_prompt
    assert "[风格描述]" in final_prompt
    assert "[参考示例]" in final_prompt

    llm_provider.generate = original_generate


@pytest.mark.asyncio
async def test_rag_script_generation_rejects_fragment_without_snapshot(
    async_client,
    auth_headers_factory,
) -> None:
    """显式传入缺少 snapshot 的 fragment 时应直接拒绝创建任务。"""
    fragment_id = await _create_fragment(async_client, auth_headers_factory, "这条碎片还没完成同步")

    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"topic": "同步前生成", "fragment_ids": [fragment_id]},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )

    assert create_response.status_code == 422
    assert create_response.json()["error"]["message"] == "所选碎片尚未同步完成"


@pytest.mark.asyncio
async def test_rag_script_generation_succeeds_with_snapshot_only_fragment(
    async_client,
    auth_headers_factory,
    app,
    db_session_factory,
) -> None:
    """只有 backup snapshot、没有 fragments 表记录时仍应能生成脚本。"""
    fragment_payload = {
        "id": "snapshot-only-fragment",
        "created_at": "2026-03-25T09:00:00+00:00",
        "updated_at": "2026-03-25T09:05:00+00:00",
        "source": "manual",
        "audio_source": None,
        "summary": None,
        "tags": [],
        "transcript": None,
        "body_html": "<p>只存在于 backup snapshot 的碎片正文</p>",
        "plain_text_snapshot": "只存在于 backup snapshot 的碎片正文",
        "folder_id": None,
        "deleted_at": None,
    }
    with db_session_factory() as db:
        _upsert_fragment_snapshot(db, fragment_payload)
        db.commit()

    llm_provider = app.state.container.llm_provider
    original_generate = llm_provider.generate

    async def multi_generate(**kwargs):
        system_prompt = kwargs.get("system_prompt", "")
        if "SOP" in system_prompt:
            return '{"sop_type":"教育结构","sections":[{"name":"引入","key_points":["问题开场"]}]}'
        return "这是基于 snapshot-only 碎片生成的口播稿正文"

    llm_provider.generate = multi_generate
    try:
        create_response = await async_client.post(
            "/api/scripts/generation",
            json={"topic": "只有快照也能生成", "fragment_ids": [fragment_payload["id"]]},
            headers=await _auth_headers(async_client, auth_headers_factory),
        )
        assert create_response.status_code == 201
        task = await _wait_task(async_client, auth_headers_factory, create_response.json()["data"]["task_id"])
        assert task["status"] == "succeeded"
    finally:
        llm_provider.generate = original_generate
