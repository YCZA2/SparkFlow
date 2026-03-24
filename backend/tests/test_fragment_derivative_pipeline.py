"""fragment 衍生字段异步回填流水线测试。"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from models import Fragment

from modules.fragments.derivative_pipeline import PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL

pytestmark = pytest.mark.integration


async def _auth_headers(async_client, auth_headers_factory) -> dict[str, str]:
    """生成 fragment 衍生字段流水线测试使用的鉴权请求头。"""
    return await auth_headers_factory(async_client)


async def _wait_pipeline(async_client, auth_headers_factory, run_id: str, *, attempts: int = 40) -> dict:
    """轮询直到 fragment 衍生字段流水线进入终态。"""
    headers = await _auth_headers(async_client, auth_headers_factory)
    for _ in range(attempts):
        response = await async_client.get(f"/api/pipelines/{run_id}", headers=headers)
        assert response.status_code == 200
        payload = response.json()["data"]
        if payload["status"] in {"succeeded", "failed", "cancelled"}:
            return payload
        await asyncio.sleep(0.05)
    raise AssertionError(f"pipeline {run_id} did not finish")


async def _create_fragment(async_client, auth_headers_factory, body_html: str) -> str:
    """创建一条可用于异步回填的 fragment。"""
    response = await async_client.post(
        "/api/fragments/content",
        json={"body_html": body_html, "source": "manual"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


@pytest.mark.asyncio
async def test_fragment_derivative_pipeline_backfills_summary_tags_and_vector(
    async_client,
    auth_headers_factory,
    app,
    db_session_factory,
    vector_store,
) -> None:
    """异步衍生字段流水线应回填摘要、标签并写入向量。"""
    fragment_id = await _create_fragment(async_client, auth_headers_factory, "<p>定位方法论测试文本</p>")
    run = await app.state.container.pipeline_runner.create_run(
        run_id=None,
        user_id="test-user-001",
        pipeline_type=PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
        input_payload={"fragment_id": fragment_id, "effective_text": "定位方法论测试文本"},
        resource_type="fragment",
        resource_id=fragment_id,
    )
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, run.id)
    assert pipeline["status"] == "succeeded"

    with db_session_factory() as db:
        fragment = db.query(Fragment).filter(Fragment.id == fragment_id).first()
        assert fragment is not None
        assert fragment.summary
        assert fragment.tags
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
        fragment_id = await _create_fragment(async_client, auth_headers_factory, "<p>创业增长策略测试</p>")
        run = await app.state.container.pipeline_runner.create_run(
            run_id=None,
            user_id="test-user-001",
            pipeline_type=PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
            input_payload={"fragment_id": fragment_id, "effective_text": "创业增长策略测试"},
            resource_type="fragment",
            resource_id=fragment_id,
        )
        pipeline = await _wait_pipeline(async_client, auth_headers_factory, run.id)
        assert pipeline["status"] == "succeeded"

        with db_session_factory() as db:
            fragment = db.query(Fragment).filter(Fragment.id == fragment_id).first()
            assert fragment is not None
            assert fragment.summary
            assert fragment.tags
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
        fragment_id = await _create_fragment(async_client, auth_headers_factory, "<p>踏实成长测试文本</p>")
        run = await app.state.container.pipeline_runner.create_run(
            run_id=None,
            user_id="test-user-001",
            pipeline_type=PIPELINE_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
            input_payload={"fragment_id": fragment_id, "effective_text": "踏实成长测试文本"},
            resource_type="fragment",
            resource_id=fragment_id,
        )
        pipeline = await _wait_pipeline(async_client, auth_headers_factory, run.id)
        assert pipeline["status"] == "succeeded"

        with db_session_factory() as db:
            fragment = db.query(Fragment).filter(Fragment.id == fragment_id).first()
            assert fragment is not None
            assert fragment.summary
            assert fragment.tags
    finally:
        app.state.container.vector_store.upsert_fragment = original_upsert
