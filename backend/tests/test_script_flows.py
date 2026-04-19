"""脚本链路集成测试（CRUD、每日推盘、音频上传转写）。"""

from __future__ import annotations

import asyncio
import io
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from domains.backups import repository as backup_repository
from modules.auth.application import TEST_USER_ID
from modules.fragments.derivative_task import TASK_TYPE_FRAGMENT_DERIVATIVE_BACKFILL

from tests.flow_helpers import (
    _auth_headers,
    _backup_fragment,
    _create_folder,
    _create_fragment,
    _editor_document,
    _seed_fragment_vector,
    _wait_fragment_derivatives,
    _wait_task,
    _wait_vector_doc,
)

pytestmark = pytest.mark.integration


def _read_fragment_payload(db_session_factory, fragment_id: str) -> dict:
    """读取原始 fragment snapshot payload，供上传链路断言复用。"""
    with db_session_factory() as db:
        record = backup_repository.get_record(
            db=db,
            user_id=TEST_USER_ID,
            entity_type="fragment",
            entity_id=fragment_id,
        )
        assert record is not None
        return json.loads(record.payload_json or "{}")


@pytest.mark.asyncio
async def test_get_daily_push_returns_not_found_when_missing(async_client, auth_headers_factory) -> None:
    """没有每日推盘脚本时应返回未找到。"""
    response = await async_client.get("/api/scripts/daily-push", headers=await _auth_headers(async_client, auth_headers_factory))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_scripts_list_detail_update_and_delete(async_client, auth_headers_factory) -> None:
    """脚本列表、详情、更新和删除应形成完整 CRUD。"""
    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"topic": "用于脚本列表和详情测试的主题"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_response.status_code == 201
    task = await _wait_task(async_client, auth_headers_factory, create_response.json()["data"]["task_id"])
    assert task["status"] == "succeeded"
    script_id = task["resource"]["resource_id"]

    list_response = await async_client.get("/api/scripts", headers=await _auth_headers(async_client, auth_headers_factory))
    assert script_id in {item["id"] for item in list_response.json()["data"]["items"]}

    detail_response = await async_client.get(f"/api/scripts/{script_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert detail_response.json()["data"]["id"] == script_id

    update_response = await async_client.patch(
        f"/api/scripts/{script_id}",
        json={"status": "ready", "title": "新的标题"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert update_response.json()["data"]["status"] == "ready"

    delete_response = await async_client.delete(f"/api/scripts/{script_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert delete_response.status_code == 200

    not_found_response = await async_client.get(f"/api/scripts/{script_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert not_found_response.status_code == 404


@pytest.mark.asyncio
async def test_update_script_rejects_invalid_status(async_client, auth_headers_factory) -> None:
    """非法脚本状态更新应被校验层拦截。"""
    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"topic": "用于非法状态测试的主题"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_response.status_code == 201
    task = await _wait_task(async_client, auth_headers_factory, create_response.json()["data"]["task_id"])
    assert task["status"] == "succeeded"
    script_id = task["resource"]["resource_id"]

    response = await async_client.patch(
        f"/api/scripts/{script_id}",
        json={"status": "published"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION"


@pytest.mark.asyncio
async def test_upload_audio_transitions_to_synced_with_folder_and_tags(async_client, auth_headers_factory, db_session_factory) -> None:
    """上传音频后应通过后台流水线完成转写、摘要和标签补写。"""
    folder_id = await _create_folder(async_client, auth_headers_factory, "录音箱")
    response = await async_client.post(
        "/api/transcriptions",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
        data={"folder_id": folder_id, "local_fragment_id": "upload-local-001"},
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["task_type"] == "media_ingestion"
    assert payload["fragment_id"] is None
    assert payload["local_fragment_id"] == "upload-local-001"
    assert payload["audio_file_url"]
    assert "audio_path" not in payload
    assert "relative_path" not in payload
    task = await _wait_task(async_client, auth_headers_factory, payload["task_id"], attempts=140)
    assert task["status"] == "succeeded"
    assert task["output"]["summary"] is None
    assert task["output"]["tags"] == []

    enriched = await _wait_fragment_derivatives(db_session_factory, "upload-local-001")
    assert enriched.audio_source == "upload"
    assert enriched.summary
    assert enriched.tags

    snapshot_payload = _read_fragment_payload(db_session_factory, "upload-local-001")
    assert snapshot_payload["audio_source"] == "upload"
    assert snapshot_payload["transcript"] == "转写完成"
    assert snapshot_payload["folder_id"] == folder_id
    assert payload["audio_file_url"]


@pytest.mark.asyncio
async def test_upload_audio_with_local_fragment_id_succeeds_without_projection(async_client, auth_headers_factory, app, db_session_factory) -> None:
    """local-first 主路径应仅依赖任务与逻辑 ID，不要求旧 projection 行。"""
    response = await async_client.post(
        "/api/transcriptions",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
        data={"local_fragment_id": "local-fragment-001"},
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["fragment_id"] is None
    assert payload["local_fragment_id"] == "local-fragment-001"

    task = await _wait_task(async_client, auth_headers_factory, payload["task_id"], attempts=140)
    assert task["status"] == "succeeded"
    assert task["resource"]["resource_type"] == "local_fragment"
    assert task["resource"]["resource_id"] == "local-fragment-001"
    assert task["output"]["local_fragment_id"] == "local-fragment-001"
    assert task["output"]["fragment_id"] is None
    assert task["output"]["transcript"] == "转写完成"

    vector_doc = await _wait_vector_doc(app, "local-fragment-001")
    assert vector_doc["text"] == "转写完成"
    assert vector_doc["source"] == "voice"

    snapshot_payload = _read_fragment_payload(db_session_factory, "local-fragment-001")
    assert snapshot_payload["transcript"] == "转写完成"


@pytest.mark.asyncio
async def test_upload_audio_succeeds_when_derivative_enqueue_fails(async_client, auth_headers_factory, app, db_session_factory) -> None:
    """异步衍生字段回填入队失败时，主转写链路仍应成功。"""
    original_create_run = app.state.container.task_runner.create_run

    async def create_run_with_derivative_failure(**kwargs):
        if kwargs.get("task_type") == TASK_TYPE_FRAGMENT_DERIVATIVE_BACKFILL:
            raise RuntimeError("derivative enqueue boom")
        return await original_create_run(**kwargs)

    app.state.container.task_runner.create_run = create_run_with_derivative_failure
    try:
        response = await async_client.post(
            "/api/transcriptions",
            headers=await _auth_headers(async_client, auth_headers_factory),
            files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
            data={"local_fragment_id": "upload-local-derivative-fail"},
        )
        assert response.status_code == 200
        payload = response.json()["data"]
        task = await _wait_task(async_client, auth_headers_factory, payload["task_id"], attempts=140)
        assert task["status"] == "succeeded"
        assert task["output"]["transcript"] == "转写完成"
        assert task["output"]["summary"] is None
        assert task["output"]["tags"] == []

        snapshot_payload = _read_fragment_payload(db_session_factory, "upload-local-derivative-fail")
        assert snapshot_payload["transcript"] == "转写完成"
        assert snapshot_payload.get("summary") is None
        assert snapshot_payload.get("tags") == []
    finally:
        app.state.container.task_runner.create_run = original_create_run


@pytest.mark.asyncio
async def test_upload_audio_marks_failed_when_stt_crashes(async_client, auth_headers_factory, app, db_session_factory) -> None:
    """STT 异常时应让任务失败，并保留排障所需 placeholder snapshot。"""
    app.state.container.stt_provider = SimpleNamespace(
        transcribe=AsyncMock(side_effect=RuntimeError("stt boom")),
        health_check=AsyncMock(return_value=True),
    )
    response = await async_client.post(
        "/api/transcriptions",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
        data={"local_fragment_id": "upload-local-stt-fail"},
    )
    payload = response.json()["data"]
    task = await _wait_task(async_client, auth_headers_factory, payload["task_id"], attempts=140)
    assert task["status"] == "failed"
    steps_response = await async_client.get(
        f"/api/tasks/{payload['task_id']}/steps",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    steps = {item["step_name"]: item for item in steps_response.json()["data"]["items"]}
    assert steps["transcribe_audio"]["attempt_count"] == 3
    assert steps["transcribe_audio"]["status"] == "failed"

    snapshot_payload = _read_fragment_payload(db_session_factory, "upload-local-stt-fail")
    assert snapshot_payload["audio_source"] == "upload"
    assert snapshot_payload.get("transcript") is None


@pytest.mark.asyncio
async def test_upload_audio_retries_transcription_and_then_succeeds(async_client, auth_headers_factory, app) -> None:
    """STT 临时失败后应在重试后成功完成。"""
    successful_result = SimpleNamespace(text="转写完成", speaker_segments=[])
    app.state.container.stt_provider = SimpleNamespace(
        transcribe=AsyncMock(side_effect=[RuntimeError("temporary stt error"), successful_result]),
        health_check=AsyncMock(return_value=True),
    )
    response = await async_client.post(
        "/api/transcriptions",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
        data={"local_fragment_id": "upload-local-stt-retry"},
    )
    payload = response.json()["data"]
    task = await _wait_task(async_client, auth_headers_factory, payload["task_id"])
    assert task["status"] == "succeeded"

    steps_response = await async_client.get(
        f"/api/tasks/{payload['task_id']}/steps",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    steps = {item["step_name"]: item for item in steps_response.json()["data"]["items"]}
    assert steps["transcribe_audio"]["status"] == "succeeded"
    assert steps["transcribe_audio"]["attempt_count"] == 2


@pytest.mark.asyncio
async def test_upload_audio_uses_fallback_enrichment_when_llm_is_too_slow(async_client, auth_headers_factory, app, db_session_factory) -> None:
    """异步衍生字段超时时应走 fallback，且不影响主转写成功。"""

    async def slow_generate(**kwargs):
        await asyncio.sleep(0.05)
        return "不会被用到"

    app.state.container.llm_provider = SimpleNamespace(generate=slow_generate, health_check=AsyncMock(return_value=True))

    with patch("modules.fragments.derivative_service.generate_summary_and_tags", side_effect=asyncio.TimeoutError()):
        response = await async_client.post(
            "/api/transcriptions",
            headers=await _auth_headers(async_client, auth_headers_factory),
            files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
            data={"local_fragment_id": "upload-local-llm-timeout"},
        )
    payload = response.json()["data"]
    task = await _wait_task(async_client, auth_headers_factory, payload["task_id"])
    assert task["status"] == "succeeded"
    assert task["output"]["summary"] is None
    assert task["output"]["tags"] == []

    enriched = await _wait_fragment_derivatives(db_session_factory, "upload-local-llm-timeout")
    assert enriched.summary
    assert enriched.tags

    snapshot_payload = _read_fragment_payload(db_session_factory, "upload-local-llm-timeout")
    assert snapshot_payload["summary"]
    assert snapshot_payload["tags"]


@pytest.mark.asyncio
async def test_upload_audio_marks_failed_when_transcription_is_cancelled(async_client, auth_headers_factory, app, db_session_factory) -> None:
    """取消异常也应让任务进入失败终态。"""
    app.state.container.stt_provider = SimpleNamespace(
        transcribe=AsyncMock(side_effect=asyncio.CancelledError()),
        health_check=AsyncMock(return_value=True),
    )
    response = await async_client.post(
        "/api/transcriptions",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
        data={"local_fragment_id": "upload-local-cancelled"},
    )
    payload = response.json()["data"]
    task = await _wait_task(async_client, auth_headers_factory, payload["task_id"])
    assert task["status"] == "failed"

    snapshot_payload = _read_fragment_payload(db_session_factory, "upload-local-cancelled")
    assert snapshot_payload.get("transcript") is None


@pytest.mark.asyncio
async def test_scripts_daily_push_trigger_get_force_trigger_and_idempotency(async_client, auth_headers_factory, app, db_session_factory) -> None:
    """每日推盘触发后应返回异步任务，并在完成后保持幂等。"""
    fragment_ids = [
        (
            await _create_fragment(db_session_factory, {"editor_document": _editor_document(f"同主题内容 {index}"), "source": "manual"})
        )
        for index in range(3)
    ]
    for fragment in fragment_ids:
        await _backup_fragment(async_client, auth_headers_factory, fragment)
        _seed_fragment_vector(app, fragment["id"], "同主题内容", source=fragment["source"])

    first_response = await async_client.post("/api/scripts/daily-push/trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    assert first_response.status_code == 200
    first_run_id = first_response.json()["data"]["task_id"]
    task = await _wait_task(async_client, auth_headers_factory, first_run_id)
    assert task["status"] == "succeeded"

    get_response = await async_client.get("/api/scripts/daily-push", headers=await _auth_headers(async_client, auth_headers_factory))
    assert get_response.json()["data"]["id"] == task["resource"]["resource_id"]

    second_response = await async_client.post("/api/scripts/daily-push/trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    force_response = await async_client.post("/api/scripts/daily-push/force-trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    assert second_response.json()["data"]["task_id"] == first_run_id
    assert force_response.json()["data"]["task_id"] == first_run_id
