"""每日推盘 pipeline 任务态测试。"""

from __future__ import annotations

import asyncio
from collections.abc import Sequence
from datetime import datetime, timedelta, timezone

import pytest
pytestmark = pytest.mark.integration

async def _auth_headers(async_client, auth_headers_factory) -> dict[str, str]:
    """生成每日推盘测试使用的鉴权请求头。"""
    return await auth_headers_factory(async_client)


async def _push_fragment_backups(
    async_client,
    auth_headers_factory,
    items: Sequence[dict[str, object]],
) -> list[str]:
    """通过备份接口写入 fragment 快照，模拟 local-first 客户端已同步数据。"""
    response = await async_client.post(
        "/api/backups/batch",
        json={"items": list(items)},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 200
    assert response.json()["data"]["accepted_count"] == len(items)
    return [str(item["entity_id"]) for item in items]


def _build_fragment_backup_item(fragment_id: str, transcript: str, created_at: datetime) -> dict[str, object]:
    """构造符合移动端备份协议的 fragment 快照。"""
    updated_at = created_at + timedelta(minutes=1)
    return {
        "entity_type": "fragment",
        "entity_id": fragment_id,
        "entity_version": 1,
        "operation": "upsert",
        "modified_at": updated_at.isoformat(),
        "payload": {
            "id": fragment_id,
            "folder_id": None,
            "source": "manual",
            "audio_source": None,
            "created_at": created_at.isoformat(),
            "updated_at": updated_at.isoformat(),
            "summary": None,
            "tags": [],
            "transcript": transcript,
            "speaker_segments": None,
            "audio_object_key": None,
            "audio_file_url": None,
            "audio_file_expires_at": None,
            "body_html": f"<p>{transcript}</p>",
            "plain_text_snapshot": transcript,
            "content_state": "body_present",
            "is_filmed": False,
            "filmed_at": None,
            "deleted_at": None,
        },
    }


async def _wait_task(async_client, auth_headers_factory, task_id: str, *, attempts: int = 40) -> dict:
    """轮询直到每日推盘任务进入终态。"""
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
async def test_daily_push_pipeline_creates_script_and_reuses_same_run(
    async_client,
    auth_headers_factory,
    app,
) -> None:
    """每日推盘应直接调用 LLM 生成脚本，并在同一天复用同一条结果。"""
    now = datetime.now(timezone.utc)
    fragment_ids = await _push_fragment_backups(
        async_client,
        auth_headers_factory,
        [
            _build_fragment_backup_item(f"fragment-{index}", f"同主题每日推盘碎片 {index}", now + timedelta(minutes=index))
            for index in range(3)
        ],
    )
    for fragment_id in fragment_ids:
        app.state.container.vector_store.fragment_docs[fragment_id] = {
            "user_id": "test-user-001",
            "fragment_id": fragment_id,
            "text": "同主题每日推盘碎片",
            "source": "manual",
            "summary": None,
            "tags": [],
        }

    first_response = await async_client.post("/api/scripts/daily-push/trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    assert first_response.status_code == 200
    first_payload = first_response.json()["data"]
    assert first_payload["task_type"] == "daily_push_generation"

    second_response = await async_client.post("/api/scripts/daily-push/trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    assert second_response.status_code == 200
    assert second_response.json()["data"]["task_id"] == first_payload["task_id"]

    task = await _wait_task(async_client, auth_headers_factory, first_payload["task_id"])
    assert task["status"] == "succeeded"
    assert task["resource"]["resource_type"] == "script"
    assert task["output"]["is_daily_push"] is True

    get_response = await async_client.get("/api/scripts/daily-push", headers=await _auth_headers(async_client, auth_headers_factory))
    assert get_response.status_code == 200
    assert get_response.json()["data"]["id"] == task["resource"]["resource_id"]


@pytest.mark.asyncio
async def test_daily_push_pipeline_force_trigger_reuses_existing_result(async_client, auth_headers_factory, app) -> None:
    """强制触发在当日已有结果时应复用同一条流水线结果。"""
    now = datetime.now(timezone.utc)
    fragment_ids = await _push_fragment_backups(
        async_client,
        auth_headers_factory,
        [
            _build_fragment_backup_item(f"force-fragment-{index}", f"强制推盘碎片 {index}", now + timedelta(minutes=index))
            for index in range(3)
        ],
    )
    for fragment_id in fragment_ids:
        app.state.container.vector_store.fragment_docs[fragment_id] = {
            "user_id": "test-user-001",
            "fragment_id": fragment_id,
            "text": "强制推盘",
            "source": "manual",
            "summary": None,
            "tags": [],
        }

    first_response = await async_client.post("/api/scripts/daily-push/trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    first_run_id = first_response.json()["data"]["task_id"]
    await _wait_task(async_client, auth_headers_factory, first_run_id)

    force_response = await async_client.post("/api/scripts/daily-push/force-trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    assert force_response.status_code == 200
    assert force_response.json()["data"]["task_id"] == first_run_id


@pytest.mark.asyncio
async def test_daily_push_pipeline_marks_failed_when_llm_fails(
    async_client,
    auth_headers_factory,
    app,
) -> None:
    """LLM 生成失败时应把 pipeline 标记为失败。"""
    now = datetime.now(timezone.utc)
    fragment_ids = await _push_fragment_backups(
        async_client,
        auth_headers_factory,
        [
            _build_fragment_backup_item(f"failed-fragment-{index}", f"失败测试碎片 {index}", now + timedelta(minutes=index))
            for index in range(3)
        ],
    )
    for fragment_id in fragment_ids:
        app.state.container.vector_store.fragment_docs[fragment_id] = {
            "user_id": "test-user-001",
            "fragment_id": fragment_id,
            "text": "失败测试",
            "source": "manual",
            "summary": None,
            "tags": [],
        }
    app.state.container.llm_provider.queue_error(RuntimeError("LLM error"))

    response = await async_client.post("/api/scripts/daily-push/trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    assert response.status_code == 200
    task = await _wait_task(async_client, auth_headers_factory, response.json()["data"]["task_id"])
    assert task["status"] == "failed"


@pytest.mark.asyncio
async def test_scheduler_daily_push_job_enqueues_pipeline(async_client, auth_headers_factory, app) -> None:
    """scheduler 应复用同一条异步每日推盘流水线。"""
    yesterday = datetime.now(timezone.utc) - timedelta(days=1)
    fragment_ids = await _push_fragment_backups(
        async_client,
        auth_headers_factory,
        [
            _build_fragment_backup_item(f"scheduled-fragment-{index}", f"调度推盘碎片 {index}", yesterday + timedelta(minutes=index))
            for index in range(3)
        ],
    )
    for fragment_id in fragment_ids:
        app.state.container.vector_store.fragment_docs[fragment_id] = {
            "user_id": "test-user-001",
            "fragment_id": fragment_id,
            "text": "调度推盘",
            "source": "manual",
            "summary": None,
            "tags": [],
        }

    result = await app.state.scheduler_service.run_job()
    assert result["queued_runs"]

    task = await _wait_task(async_client, auth_headers_factory, result["run_ids"][0])
    assert task["status"] == "succeeded"


@pytest.mark.asyncio
async def test_scheduler_daily_push_ignores_fragment_rows_without_backups(
    async_client,
    auth_headers_factory,
    app,
) -> None:
    """只有空 placeholder snapshot 时，scheduler 不应误生成每日推盘。"""
    await _push_fragment_backups(
        async_client,
        auth_headers_factory,
        [
            {
                "entity_type": "fragment",
                "entity_id": "placeholder-fragment",
                "entity_version": 1,
                "operation": "upsert",
                "modified_at": datetime.now(timezone.utc).isoformat(),
                "payload": {
                    "id": "placeholder-fragment",
                    "folder_id": None,
                    "source": "voice",
                    "audio_source": "upload",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "summary": None,
                    "tags": [],
                    "transcript": None,
                    "speaker_segments": None,
                    "audio_object_key": "audio/original/test-user-001/placeholder-fragment/file.m4a",
                    "audio_file_url": "https://example.com/audio.m4a",
                    "audio_file_expires_at": "2026-03-31T02:00:00+00:00",
                    "body_html": "",
                    "plain_text_snapshot": "",
                    "content_state": "empty",
                    "is_filmed": False,
                    "filmed_at": None,
                    "deleted_at": None,
                },
            }
        ],
    )
    result = await app.state.scheduler_service.run_job()
    assert result["queued_runs"] == 0
