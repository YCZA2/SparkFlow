"""外挂工作流接口测试。"""

from __future__ import annotations

import json

import httpx
import pytest

from core.auth import create_access_token
from models import AgentRun, Script
from tests.support import FakeWebSearchProvider


@pytest.fixture
def web_search_provider() -> FakeWebSearchProvider:
    """为工作流测试提供可记录查询词的搜索替身。"""
    return FakeWebSearchProvider()


@pytest.fixture
def dify_http_client():
    """提供可控的 Dify MockTransport 客户端。"""
    state = {"next_status": "succeeded", "submitted_runs": []}

    def _handle_request(request: httpx.Request) -> httpx.Response:
        if request.method == "POST" and request.url.path.endswith("/workflows/run"):
            payload = json.loads(request.content.decode("utf-8"))
            assert "selected_fragments" in payload["inputs"]
            assert isinstance(payload["inputs"]["selected_fragments"], str)
            assert isinstance(payload["inputs"]["knowledge_hits"], str)
            assert isinstance(payload["inputs"]["web_hits"], str)
            assert isinstance(payload["inputs"]["generation_metadata"], str)
            selected_fragments = json.loads(payload["inputs"]["selected_fragments"])
            assert isinstance(selected_fragments, list)
            assert selected_fragments
            assert selected_fragments[0]["transcript"]
            run_id = "dify-run-001"
            state["submitted_runs"].append(run_id)
            return httpx.Response(200, json={"data": {"id": run_id, "workflow_id": "wf-script-001", "status": "running", "outputs": {}}})
        if request.method == "GET" and request.url.path.endswith("/workflows/run/dify-run-001"):
            status = state["next_status"]
            outputs = {
                "title": "一条新脚本",
                "outline": "提纲",
                "draft": "这是 Dify 生成的口播稿",
                "used_sources": [{"type": "knowledge", "title": "定位文档"}],
                "review_notes": "已自检",
            }
            if status == "failed":
                return httpx.Response(200, json={"data": {"id": "dify-run-001", "workflow_id": "wf-script-001", "status": status, "error": "workflow failed", "outputs": {}}})
            return httpx.Response(200, json={"data": {"id": "dify-run-001", "workflow_id": "wf-script-001", "status": status, "outputs": outputs}})
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    client = httpx.AsyncClient(transport=httpx.MockTransport(_handle_request))
    client.test_state = state  # type: ignore[attr-defined]
    return client


async def _auth_headers(async_client, auth_headers_factory) -> dict[str, str]:
    """生成工作流测试用鉴权请求头。"""
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


async def _create_knowledge_doc(async_client, auth_headers_factory, *, title: str, content: str) -> str:
    """创建知识库文档并返回其 ID。"""
    response = await async_client.post(
        "/api/knowledge",
        json={"title": title, "content": content, "doc_type": "high_likes"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 200
    return response.json()["data"]["id"]


@pytest.mark.asyncio
async def test_create_run_and_refresh_to_script(async_client, auth_headers_factory, app, db_session_factory, web_search_provider) -> None:
    """工作流刷新成功后应回流生成脚本记录。"""
    fragment_id = await _create_fragment(async_client, auth_headers_factory, "关于定位的一条碎片")
    knowledge_doc_id = await _create_knowledge_doc(async_client, auth_headers_factory, title="定位文档", content="关于定位的经验")
    app.state.container.vector_store.knowledge_results = [{"doc_id": knowledge_doc_id, "score": 0.91}]

    create_response = await async_client.post(
        "/api/agent/script-research-runs",
        json={"fragment_ids": [fragment_id], "mode": "mode_a", "query_hint": "写一篇关于定位的口播稿", "include_web_search": True},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_response.status_code == 201
    run_id = create_response.json()["data"]["id"]
    assert create_response.json()["data"]["status"] == "running"

    refresh_response = await async_client.post(f"/api/agent/runs/{run_id}/refresh", headers=await _auth_headers(async_client, auth_headers_factory))
    payload = refresh_response.json()["data"]
    assert refresh_response.status_code == 200
    assert payload["status"] == "succeeded"
    assert payload["script_id"]
    assert payload["result"]["draft"] == "这是 Dify 生成的口播稿"
    assert len(web_search_provider.calls) == 1

    with db_session_factory() as db:
        run = db.query(AgentRun).filter(AgentRun.id == run_id).first()
        script = db.query(Script).filter(Script.id == payload["script_id"]).first()
        assert run is not None
        assert script is not None
        assert run.script_id == script.id
        assert script.content == "这是 Dify 生成的口播稿"


@pytest.mark.asyncio
async def test_refresh_failed_run_returns_error(async_client, auth_headers_factory, app, dify_http_client) -> None:
    """工作流失败时应返回失败状态和错误信息。"""
    fragment_id = await _create_fragment(async_client, auth_headers_factory, "关于选题的一条碎片")
    create_response = await async_client.post(
        "/api/agent/script-research-runs",
        json={"fragment_ids": [fragment_id], "mode": "mode_a"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    run_id = create_response.json()["data"]["id"]

    dify_http_client.test_state["next_status"] = "failed"  # type: ignore[attr-defined]
    refresh_response = await async_client.post(f"/api/agent/runs/{run_id}/refresh", headers=await _auth_headers(async_client, auth_headers_factory))
    assert refresh_response.status_code == 200
    assert refresh_response.json()["data"]["status"] == "failed"
    assert "workflow failed" in refresh_response.json()["data"]["error_message"]


@pytest.mark.asyncio
async def test_create_run_can_remain_running(async_client, auth_headers_factory, app, dify_http_client) -> None:
    """工作流未完成时应继续保持 running。"""
    fragment_id = await _create_fragment(async_client, auth_headers_factory, "关于持续轮询的一条碎片")
    create_response = await async_client.post(
        "/api/agent/script-research-runs",
        json={"fragment_ids": [fragment_id], "mode": "mode_a"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    run_id = create_response.json()["data"]["id"]

    dify_http_client.test_state["next_status"] = "running"  # type: ignore[attr-defined]
    refresh_response = await async_client.post(f"/api/agent/runs/{run_id}/refresh", headers=await _auth_headers(async_client, auth_headers_factory))
    assert refresh_response.status_code == 200
    assert refresh_response.json()["data"]["status"] == "running"


@pytest.mark.asyncio
async def test_other_user_cannot_read_run(async_client, auth_headers_factory) -> None:
    """其他用户不应读取当前用户的工作流记录。"""
    fragment_id = await _create_fragment(async_client, auth_headers_factory, "关于表达方式的一条碎片")
    create_response = await async_client.post(
        "/api/agent/script-research-runs",
        json={"fragment_ids": [fragment_id], "mode": "mode_a"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    run_id = create_response.json()["data"]["id"]

    other_headers = {"Authorization": f"Bearer {create_access_token(user_id='other-user-001', role='user')}"}
    forbidden = await async_client.get(f"/api/agent/runs/{run_id}", headers=other_headers)
    assert forbidden.status_code == 404
