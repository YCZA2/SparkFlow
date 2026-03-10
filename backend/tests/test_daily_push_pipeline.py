"""每日推盘 pipeline 任务态测试。"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from models import Fragment


async def _auth_headers(async_client, auth_headers_factory) -> dict[str, str]:
    """生成每日推盘测试使用的鉴权请求头。"""
    return await auth_headers_factory(async_client)


async def _create_fragment(async_client, auth_headers_factory, transcript: str) -> str:
    """创建手动碎片并返回其 ID。"""
    response = await async_client.post(
        "/api/fragments",
        json={"transcript": transcript, "source": "manual"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


async def _wait_pipeline(async_client, auth_headers_factory, run_id: str, *, attempts: int = 40) -> dict:
    """轮询直到每日推盘流水线进入终态。"""
    headers = await _auth_headers(async_client, auth_headers_factory)
    for _ in range(attempts):
        response = await async_client.get(f"/api/pipelines/{run_id}", headers=headers)
        assert response.status_code == 200
        payload = response.json()["data"]
        if payload["status"] in {"succeeded", "failed", "cancelled"}:
            return payload
        await asyncio.sleep(0.05)
    raise AssertionError(f"pipeline {run_id} did not finish")


@pytest.mark.asyncio
async def test_daily_push_pipeline_creates_script_and_reuses_same_run(
    async_client,
    auth_headers_factory,
    app,
    daily_push_workflow_provider,
) -> None:
    """每日推盘应走异步 workflow，并在同一天复用同一条结果。"""
    fragment_ids = [
        await _create_fragment(async_client, auth_headers_factory, f"同主题每日推盘碎片 {index}")
        for index in range(3)
    ]
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
    assert first_payload["pipeline_type"] == "daily_push_generation"

    second_response = await async_client.post("/api/scripts/daily-push/trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    assert second_response.status_code == 200
    assert second_response.json()["data"]["pipeline_run_id"] == first_payload["pipeline_run_id"]

    pipeline = await _wait_pipeline(async_client, auth_headers_factory, first_payload["pipeline_run_id"])
    assert pipeline["status"] == "succeeded"
    assert pipeline["resource"]["resource_type"] == "script"
    assert pipeline["output"]["is_daily_push"] is True

    get_response = await async_client.get("/api/scripts/daily-push", headers=await _auth_headers(async_client, auth_headers_factory))
    assert get_response.status_code == 200
    assert get_response.json()["data"]["id"] == pipeline["resource"]["resource_id"]

    inputs = daily_push_workflow_provider.last_submitted_inputs()
    assert inputs["trigger_kind"] == "manual"
    assert len(inputs["selected_fragments"]) == 3
    assert inputs["fragments_text"]


@pytest.mark.asyncio
async def test_daily_push_pipeline_force_trigger_reuses_existing_result(async_client, auth_headers_factory, app) -> None:
    """强制触发在当日已有结果时应复用同一条流水线结果。"""
    fragment_ids = [
        await _create_fragment(async_client, auth_headers_factory, f"强制推盘碎片 {index}")
        for index in range(3)
    ]
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
    first_run_id = first_response.json()["data"]["pipeline_run_id"]
    await _wait_pipeline(async_client, auth_headers_factory, first_run_id)

    force_response = await async_client.post("/api/scripts/daily-push/force-trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    assert force_response.status_code == 200
    assert force_response.json()["data"]["pipeline_run_id"] == first_run_id


@pytest.mark.asyncio
async def test_daily_push_pipeline_marks_failed_when_provider_fails(
    async_client,
    auth_headers_factory,
    app,
    daily_push_workflow_provider,
) -> None:
    """每日推盘 provider 失败时应把 pipeline 标记为失败。"""
    fragment_ids = [
        await _create_fragment(async_client, auth_headers_factory, f"失败测试碎片 {index}")
        for index in range(3)
    ]
    for fragment_id in fragment_ids:
        app.state.container.vector_store.fragment_docs[fragment_id] = {
            "user_id": "test-user-001",
            "fragment_id": fragment_id,
            "text": "失败测试",
            "source": "manual",
            "summary": None,
            "tags": [],
        }
    daily_push_workflow_provider.queue_failure()

    response = await async_client.post("/api/scripts/daily-push/trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    assert response.status_code == 200
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, response.json()["data"]["pipeline_run_id"])
    assert pipeline["status"] == "failed"
    assert "workflow failed" in (pipeline["error_message"] or "")


@pytest.mark.asyncio
async def test_scheduler_daily_push_job_enqueues_pipeline(async_client, auth_headers_factory, app, db_session_factory) -> None:
    """scheduler 应复用同一条异步每日推盘流水线。"""
    fragment_ids = [
        await _create_fragment(async_client, auth_headers_factory, f"调度推盘碎片 {index}")
        for index in range(3)
    ]
    with db_session_factory() as db:
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)
        fragments = db.query(Fragment).filter(Fragment.id.in_(fragment_ids)).all()
        for fragment in fragments:
            fragment.created_at = yesterday
        db.commit()
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

    pipeline = await _wait_pipeline(async_client, auth_headers_factory, result["run_ids"][0])
    assert pipeline["status"] == "succeeded"
