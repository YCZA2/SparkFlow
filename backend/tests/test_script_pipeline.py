"""脚本 pipeline 任务态测试。"""

from __future__ import annotations

import asyncio

import pytest

from tests.support import FakeWebSearchProvider, FakeWorkflowProvider

pytestmark = pytest.mark.integration

async def _auth_headers(async_client, auth_headers_factory) -> dict[str, str]:
    """生成脚本 pipeline 测试使用的鉴权请求头。"""
    return await auth_headers_factory(async_client)


async def _create_fragment(async_client, auth_headers_factory, transcript: str) -> str:
    """创建手动碎片并返回其 ID。"""
    response = await async_client.post(
        "/api/fragments/content",
        json={"body_html": f"<p>{transcript}</p>", "source": "manual"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


async def _create_knowledge_doc(async_client, auth_headers_factory, *, title: str, body_markdown: str) -> str:
    """创建知识库文档并返回其 ID。"""
    response = await async_client.post(
        "/api/knowledge",
        json={"title": title, "body_markdown": body_markdown, "doc_type": "high_likes"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 200
    return response.json()["data"]["id"]


async def _wait_pipeline(async_client, auth_headers_factory, run_id: str, *, attempts: int = 40) -> dict:
    """轮询直到脚本流水线进入终态。"""
    headers = await _auth_headers(async_client, auth_headers_factory)
    for _ in range(attempts):
        response = await async_client.get(f"/api/pipelines/{run_id}", headers=headers)
        assert response.status_code == 200
        payload = response.json()["data"]
        if payload["status"] in {"succeeded", "failed", "cancelled"}:
            return payload
        await asyncio.sleep(0.05)
    raise AssertionError(f"pipeline {run_id} did not finish")


@pytest.fixture
def web_search_provider() -> FakeWebSearchProvider:
    """提供可记录查询词的 Web 搜索替身。"""
    return FakeWebSearchProvider()


@pytest.fixture
def script_mode_a_workflow_provider() -> FakeWorkflowProvider:
    """提供可观察结构化上下文的 mode_a workflow provider 替身。"""
    provider = FakeWorkflowProvider()
    provider.provider_workflow_id = "wf-script-mode-a-001"
    provider.queue_success(draft="这是 pipeline 生成的口播稿")
    return provider


@pytest.mark.asyncio
async def test_script_generation_pipeline_collects_context_and_persists_script(
    async_client,
    auth_headers_factory,
    app,
    web_search_provider,
    script_mode_a_workflow_provider,
) -> None:
    """脚本生成应把结构化上下文传给 provider，并在成功后暴露 script 资源。"""
    fragment_id = await _create_fragment(async_client, auth_headers_factory, "关于定位的一条碎片")
    knowledge_doc_id = await _create_knowledge_doc(async_client, auth_headers_factory, title="定位文档", body_markdown="关于定位的经验")
    app.state.container.vector_store.knowledge_results = [{"doc_id": knowledge_doc_id, "score": 0.91}]

    create_response = await async_client.post(
        "/api/scripts/generation",
        json={
            "fragment_ids": [fragment_id],
            "mode": "mode_a",
            "query_hint": "写一篇关于定位的口播稿",
            "include_web_search": True,
        },
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_response.status_code == 201
    payload = create_response.json()["data"]
    assert payload["pipeline_type"] == "script_generation"

    pipeline = await _wait_pipeline(async_client, auth_headers_factory, payload["pipeline_run_id"])
    assert pipeline["status"] == "succeeded"
    assert pipeline["resource"]["resource_type"] == "script"
    assert pipeline["resource"]["resource_id"] == pipeline["output"]["script_id"]
    assert pipeline["output"]["provider"] == {
        "workflow_id": "wf-script-mode-a-001",
        "provider_run_id": "provider-run-default",
        "provider_task_id": "task-default",
    }

    steps_response = await async_client.get(
        f"/api/pipelines/{payload['pipeline_run_id']}/steps",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert steps_response.status_code == 200
    steps = {item["step_name"]: item for item in steps_response.json()["data"]["items"]}
    assert steps["submit_workflow_run"]["external_ref"]["provider_task_id"] == "task-default"
    assert steps["poll_workflow_run"]["external_ref"]["provider_run_id"] == "provider-run-default"

    detail_response = await async_client.get(
        f"/api/scripts/{pipeline['resource']['resource_id']}",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["body_html"] == "<p>这是 pipeline 生成的口播稿</p>"

    assert len(web_search_provider.calls) == 1
    inputs = script_mode_a_workflow_provider.last_submitted_inputs()
    assert "关于定位的一条碎片" in inputs["fragments_text"]
    assert "定位文档" in inputs["knowledge_context"]
    assert "https://example.com" in inputs["web_context"]
    assert inputs["query_hint"] == "写一篇关于定位的口播稿"


@pytest.mark.asyncio
async def test_script_generation_pipeline_marks_failed_when_provider_fails(
    async_client,
    auth_headers_factory,
    script_mode_a_workflow_provider,
) -> None:
    """provider 失败时应把 pipeline 标记为失败并回写错误信息。"""
    fragment_id = await _create_fragment(async_client, auth_headers_factory, "关于选题的一条碎片")
    script_mode_a_workflow_provider.queue_failure()

    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"fragment_ids": [fragment_id], "mode": "mode_a"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_response.status_code == 201

    pipeline = await _wait_pipeline(async_client, auth_headers_factory, create_response.json()["data"]["pipeline_run_id"])
    assert pipeline["status"] == "failed"
    assert "workflow failed" in (pipeline["error_message"] or "")


@pytest.mark.asyncio
async def test_script_generation_pipeline_keeps_submit_task_id_when_poll_response_omits_it(
    async_client,
    auth_headers_factory,
    script_mode_a_workflow_provider,
) -> None:
    """轮询结果缺少 task_id 时应继续保留提交阶段返回的 provider 句柄。"""
    fragment_id = await _create_fragment(async_client, auth_headers_factory, "关于复盘的一条碎片")
    script_mode_a_workflow_provider.poll_provider_task_id = None

    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"fragment_ids": [fragment_id], "mode": "mode_a"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_response.status_code == 201

    pipeline = await _wait_pipeline(async_client, auth_headers_factory, create_response.json()["data"]["pipeline_run_id"])
    assert pipeline["status"] == "succeeded"
    assert pipeline["output"]["provider"]["provider_task_id"] == "task-default"

    steps_response = await async_client.get(
        f"/api/pipelines/{create_response.json()['data']['pipeline_run_id']}/steps",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert steps_response.status_code == 200
    steps = {item["step_name"]: item for item in steps_response.json()["data"]["items"]}
    assert steps["submit_workflow_run"]["external_ref"]["provider_task_id"] == "task-default"
    assert steps["poll_workflow_run"]["external_ref"]["provider_task_id"] == "task-default"


@pytest.mark.asyncio
async def test_script_generation_pipeline_routes_mode_b_to_mode_b_provider(
    async_client,
    auth_headers_factory,
    app,
    script_mode_a_workflow_provider,
    script_mode_b_workflow_provider,
) -> None:
    """mode_b 请求应提交到独立的 mode_b workflow provider。"""
    fragment_id = await _create_fragment(async_client, auth_headers_factory, "关于表达风格的一条碎片")
    script_mode_b_workflow_provider.queue_success(draft="这是 mode_b 生成的口播稿")

    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"fragment_ids": [fragment_id], "mode": "mode_b"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_response.status_code == 201

    pipeline = await _wait_pipeline(async_client, auth_headers_factory, create_response.json()["data"]["pipeline_run_id"])
    assert pipeline["status"] == "succeeded"
    assert pipeline["output"]["provider"] == {
        "workflow_id": "wf-script-mode-b-001",
        "provider_run_id": "provider-run-mode-b",
        "provider_task_id": "task-mode-b",
    }
    assert script_mode_a_workflow_provider.submitted_calls() == []
    assert "关于表达风格的一条碎片" in script_mode_b_workflow_provider.last_submitted_inputs()["fragments_text"]
