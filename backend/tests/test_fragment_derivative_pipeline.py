"""fragment 衍生字段异步回填流水线测试。"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from modules.auth.application import TEST_USER_ID
from modules.backups.application import BackupUseCase
from modules.backups.schemas import BackupBatchRequest, BackupMutationItem
from modules.fragments.derivative_pipeline import PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL
from modules.shared.fragment_snapshots import FragmentSnapshotReader

pytestmark = pytest.mark.integration

_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


async def _auth_headers(async_client, auth_headers_factory) -> dict[str, str]:
    """生成 fragment 衍生字段流水线测试使用的鉴权请求头。"""
    return await auth_headers_factory(async_client)


async def _wait_task(async_client, auth_headers_factory, task_id: str, *, attempts: int = 40) -> dict:
    """轮询直到 fragment 衍生字段任务进入终态。"""
    headers = await _auth_headers(async_client, auth_headers_factory)
    for _ in range(attempts):
        response = await async_client.get(f"/api/tasks/{task_id}", headers=headers)
        assert response.status_code == 200
        payload = response.json()["data"]
        if payload["status"] in {"succeeded", "failed", "cancelled"}:
            return payload
        await asyncio.sleep(0.05)
    raise AssertionError(f"task {task_id} did not finish")


def _seed_fragment_snapshot(db_session_factory, *, fragment_id: str, text: str) -> str:
    """创建可向量化的 fragment snapshot，供异步回填流水线消费。"""
    with db_session_factory() as db:
        BackupUseCase().push_batch(
            db=db,
            user_id=TEST_USER_ID,
            payload=BackupBatchRequest(
                items=[
                    BackupMutationItem(
                        entity_type="fragment",
                        entity_id=fragment_id,
                        entity_version=1,
                        operation="upsert",
                        modified_at="2026-03-31T00:00:00+00:00",
                        last_modified_device_id="device-test",
                        payload={
                            "id": fragment_id,
                            "folder_id": None,
                            "source": "manual",
                            "audio_source": None,
                            "created_at": "2026-03-31T00:00:00+00:00",
                            "updated_at": "2026-03-31T00:00:00+00:00",
                            "summary": None,
                            "tags": [],
                            "transcript": None,
                            "speaker_segments": None,
                            "audio_object_key": None,
                            "audio_file_url": None,
                            "audio_file_expires_at": None,
                            "body_html": f"<p>{text}</p>",
                            "plain_text_snapshot": text,
                            "content_state": "body_present",
                            "is_filmed": False,
                            "filmed_at": None,
                            "deleted_at": None,
                        },
                    )
                ]
            ),
        )
    return fragment_id


def _read_fragment_snapshot(db_session_factory, fragment_id: str):
    """读取最新 snapshot，供断言摘要标签回填结果。"""
    with db_session_factory() as db:
        return _FRAGMENT_SNAPSHOT_READER.get_by_id(
            db=db,
            user_id=TEST_USER_ID,
            fragment_id=fragment_id,
        )


@pytest.mark.asyncio
async def test_fragment_derivative_pipeline_backfills_summary_tags_and_vector(
    async_client,
    auth_headers_factory,
    app,
    db_session_factory,
    vector_store,
) -> None:
    """异步衍生字段流水线应回填摘要、标签并写入向量。"""
    fragment_id = _seed_fragment_snapshot(db_session_factory, fragment_id="fragment-derivative-001", text="定位方法论测试文本")
    run = await app.state.container.pipeline_runner.create_run(
        run_id=None,
        user_id=TEST_USER_ID,
        pipeline_type=PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
        input_payload={"fragment_id": fragment_id, "effective_text": "定位方法论测试文本"},
        resource_type="fragment",
        resource_id=fragment_id,
    )
    task = await _wait_task(async_client, auth_headers_factory, run.id)
    assert task["status"] == "succeeded"

    snapshot = _read_fragment_snapshot(db_session_factory, fragment_id)
    assert snapshot is not None
    assert snapshot.summary
    assert snapshot.tags
    assert vector_store.fragment_docs[fragment_id]["text"] == "定位方法论测试文本"


@pytest.mark.asyncio
async def test_fragment_derivative_pipeline_uses_fallback_when_llm_fails(
    async_client,
    auth_headers_factory,
    app,
    db_session_factory,
) -> None:
    """LLM 失败时应走 fallback 而不是让异步回填失败。"""

    async def failing_generate(**kwargs):
        raise RuntimeError("llm boom")

    async def llm_health_check():
        return True

    original_llm_provider = app.state.container.llm_provider
    app.state.container.llm_provider = SimpleNamespace(
        generate=failing_generate,
        health_check=llm_health_check,
    )
    try:
        fragment_id = _seed_fragment_snapshot(db_session_factory, fragment_id="fragment-derivative-002", text="创业增长策略测试")
        run = await app.state.container.pipeline_runner.create_run(
            run_id=None,
            user_id=TEST_USER_ID,
            pipeline_type=PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
            input_payload={"fragment_id": fragment_id, "effective_text": "创业增长策略测试"},
            resource_type="fragment",
            resource_id=fragment_id,
        )
        task = await _wait_task(async_client, auth_headers_factory, run.id)
        assert task["status"] == "succeeded"

        snapshot = _read_fragment_snapshot(db_session_factory, fragment_id)
        assert snapshot is not None
        assert snapshot.summary
        assert snapshot.tags
    finally:
        app.state.container.llm_provider = original_llm_provider


@pytest.mark.asyncio
async def test_fragment_derivative_pipeline_logs_vector_failure_without_failing_pipeline(
    async_client,
    auth_headers_factory,
    app,
    db_session_factory,
) -> None:
    """向量写入失败时，异步回填流水线仍应成功并保留摘要标签。"""
    original_upsert = app.state.container.vector_store.upsert_fragment

    async def failing_upsert_fragment(**kwargs):
        raise RuntimeError("vector boom")

    app.state.container.vector_store.upsert_fragment = failing_upsert_fragment
    try:
        fragment_id = _seed_fragment_snapshot(db_session_factory, fragment_id="fragment-derivative-003", text="踏实成长测试文本")
        run = await app.state.container.pipeline_runner.create_run(
            run_id=None,
            user_id=TEST_USER_ID,
            pipeline_type=PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
            input_payload={"fragment_id": fragment_id, "effective_text": "踏实成长测试文本"},
            resource_type="fragment",
            resource_id=fragment_id,
        )
        task = await _wait_task(async_client, auth_headers_factory, run.id)
        assert task["status"] == "succeeded"

        snapshot = _read_fragment_snapshot(db_session_factory, fragment_id)
        assert snapshot is not None
        assert snapshot.summary
        assert snapshot.tags
    finally:
        app.state.container.vector_store.upsert_fragment = original_upsert


@pytest.mark.asyncio
async def test_fragment_derivative_pipeline_succeeds_without_fragment_projection(
    async_client,
    auth_headers_factory,
    app,
    vector_store,
) -> None:
    """缺少旧 projection 行时，异步回填仍应基于逻辑 ID 完成向量同步。"""
    run = await app.state.container.pipeline_runner.create_run(
        run_id=None,
        user_id=TEST_USER_ID,
        pipeline_type=PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
        input_payload={
            "fragment_id": None,
            "local_fragment_id": "local-fragment-001",
            "effective_text": "只存在于本地 placeholder 的转写正文",
            "source": "voice",
        },
        resource_type="local_fragment",
        resource_id="local-fragment-001",
    )
    task = await _wait_task(async_client, auth_headers_factory, run.id)
    assert task["status"] == "succeeded"
    assert task["resource"]["resource_type"] == "local_fragment"
    assert task["resource"]["resource_id"] == "local-fragment-001"
    assert task["output"]["local_fragment_id"] == "local-fragment-001"
    assert vector_store.fragment_docs["local-fragment-001"]["text"] == "只存在于本地 placeholder 的转写正文"
