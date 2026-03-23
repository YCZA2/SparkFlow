"""RAG 脚本生成 pipeline 任务态测试。"""

from __future__ import annotations

import asyncio

import pytest

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


async def _wait_pipeline(async_client, auth_headers_factory, run_id: str, *, attempts: int = 40) -> dict:
    """轮询直到流水线进入终态。"""
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
async def test_rag_script_generation_pipeline_runs_and_persists_script(
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
    assert payload["pipeline_type"] == "rag_script_generation"

    pipeline = await _wait_pipeline(async_client, auth_headers_factory, payload["pipeline_run_id"])
    assert pipeline["status"] == "succeeded"
    assert pipeline["resource"]["resource_type"] == "script"

    detail_response = await async_client.get(
        f"/api/scripts/{pipeline['resource']['resource_id']}",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert detail_response.status_code == 200
    script_data = detail_response.json()["data"]
    assert "RAG" in script_data["body_html"]
    assert script_data["mode"] == "mode_rag"

    # 恢复 LLM 替身
    llm_provider.generate = original_generate


@pytest.mark.asyncio
async def test_rag_script_generation_with_optional_fragments(
    async_client,
    auth_headers_factory,
    app,
) -> None:
    """带可选碎片的 RAG 生成应正常完成并写入 script 记录。"""
    fragment_id = await _create_fragment(async_client, auth_headers_factory, "关于早起习惯的碎片背景")
    llm_provider = app.state.container.llm_provider

    # 第一次调用（大纲）和第二次调用（脚本草稿）
    call_index = 0
    responses = [
        '{"sop_type":"教育结构","sections":[{"name":"引入","key_points":["问题开场"]}]}',
        "这是含碎片背景的口播稿正文",
    ]

    async def multi_generate(**kwargs):
        nonlocal call_index
        text = responses[call_index] if call_index < len(responses) else "生成内容"
        call_index += 1
        return text

    original_generate = llm_provider.generate
    llm_provider.generate = multi_generate

    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"topic": "早起的好处", "fragment_ids": [fragment_id]},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_response.status_code == 201
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, create_response.json()["data"]["pipeline_run_id"])
    assert pipeline["status"] == "succeeded"

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

    pipeline = await _wait_pipeline(async_client, auth_headers_factory, create_response.json()["data"]["pipeline_run_id"])
    assert pipeline["status"] == "failed"

    llm_provider.generate = original_generate
