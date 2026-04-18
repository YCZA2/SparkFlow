"""fragment snapshot 主链路回归测试。"""

from __future__ import annotations

import asyncio
import io
import json

import pytest

from domains.backups import repository as backup_repository
from modules.auth.application import TEST_USER_ID
from modules.backups.application import BackupUseCase
from modules.backups.schemas import BackupBatchRequest, BackupMutationItem
from modules.shared.fragment_snapshots import FragmentSnapshotReader

pytestmark = pytest.mark.integration


async def _auth_headers(async_client, auth_headers_factory) -> dict[str, str]:
    """生成带 Bearer Token 的请求头。"""
    return await auth_headers_factory(async_client)


async def _wait_task(async_client, auth_headers_factory, task_id: str, *, attempts: int = 80) -> dict:
    """轮询统一任务接口直到进入终态。"""
    headers = await _auth_headers(async_client, auth_headers_factory)
    for _ in range(attempts):
        response = await async_client.get(f"/api/tasks/{task_id}", headers=headers)
        assert response.status_code == 200
        payload = response.json()["data"]
        if payload["status"] in {"succeeded", "failed"}:
            return payload
        await asyncio.sleep(0.05)
    raise AssertionError(f"task {task_id} did not finish")


async def _push_fragment_snapshot(
    async_client,
    auth_headers_factory,
    *,
    fragment_id: str,
    folder_id: str | None = None,
    body_html: str = "<p>fragment body</p>",
    plain_text_snapshot: str = "fragment body",
    tags: list[str] | None = None,
) -> None:
    """通过备份接口写入一条 fragment snapshot。"""
    response = await async_client.post(
        "/api/backups/batch",
        json={
            "items": [
                {
                    "entity_type": "fragment",
                    "entity_id": fragment_id,
                    "entity_version": 1,
                    "operation": "upsert",
                    "modified_at": "2026-03-31T00:00:00+00:00",
                    "payload": {
                        "id": fragment_id,
                        "folder_id": folder_id,
                        "source": "manual",
                        "audio_source": None,
                        "created_at": "2026-03-31T00:00:00+00:00",
                        "updated_at": "2026-03-31T00:00:00+00:00",
                        "summary": None,
                        "tags": tags or [],
                        "transcript": None,
                        "speaker_segments": None,
                        "audio_object_key": None,
                        "audio_file_url": None,
                        "audio_file_expires_at": None,
                        "body_html": body_html,
                        "plain_text_snapshot": plain_text_snapshot,
                        "content_state": "body_present",
                        "is_filmed": False,
                        "filmed_at": None,
                        "deleted_at": None,
                    },
                }
            ]
        },
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 200


def test_backup_batch_preserves_server_managed_fragment_fields(db_session_factory) -> None:
    """客户端后续 flush 不应覆盖服务器已补写的摘要、标签、转写和签名字段。"""
    use_case = BackupUseCase()
    reader = FragmentSnapshotReader()
    with db_session_factory() as db:
        use_case.push_batch(
            db=db,
            user_id=TEST_USER_ID,
            payload=BackupBatchRequest(
                items=[
                    BackupMutationItem(
                        entity_type="fragment",
                        entity_id="frag-merge",
                        entity_version=1,
                        operation="upsert",
                        modified_at="2026-03-31T00:00:00+00:00",
                        last_modified_device_id="device-a",
                        payload={
                            "id": "frag-merge",
                            "source": "manual",
                            "audio_source": None,
                            "created_at": "2026-03-31T00:00:00+00:00",
                            "updated_at": "2026-03-31T00:00:00+00:00",
                            "folder_id": "folder-a",
                            "body_html": "<p>client body v1</p>",
                            "plain_text_snapshot": "client body v1",
                            "content_state": "body_present",
                            "is_filmed": False,
                            "filmed_at": None,
                            "deleted_at": None,
                            "summary": None,
                            "tags": [],
                            "transcript": None,
                            "speaker_segments": None,
                            "audio_object_key": None,
                            "audio_file_url": None,
                            "audio_file_expires_at": None,
                        },
                    )
                ]
            ),
        )
        reader.merge_server_fields(
            db=db,
            user_id=TEST_USER_ID,
            fragment_id="frag-merge",
            source="manual",
            server_patch={
                "transcript": "服务器转写",
                "summary": "服务器摘要",
                "tags": ["标签A", "标签B"],
                "audio_object_key": "audio/original/test-user-001/frag-merge/file.m4a",
                "audio_file_url": "https://server/new-signed-url",
                "audio_file_expires_at": "2026-03-31T02:00:00+00:00",
            },
        )
        use_case.push_batch(
            db=db,
            user_id=TEST_USER_ID,
            payload=BackupBatchRequest(
                items=[
                    BackupMutationItem(
                        entity_type="fragment",
                        entity_id="frag-merge",
                        entity_version=2,
                        operation="upsert",
                        modified_at="2026-03-31T01:00:00+00:00",
                        last_modified_device_id="device-a",
                        payload={
                            "id": "frag-merge",
                            "source": "manual",
                            "audio_source": None,
                            "created_at": "2026-03-31T00:00:00+00:00",
                            "updated_at": "2026-03-31T01:00:00+00:00",
                            "folder_id": "folder-b",
                            "body_html": "<p>client body v2</p>",
                            "plain_text_snapshot": "client body v2",
                            "content_state": "body_present",
                            "is_filmed": False,
                            "filmed_at": None,
                            "deleted_at": None,
                            "summary": None,
                            "tags": ["客户端旧标签"],
                            "transcript": "客户端旧转写",
                            "speaker_segments": None,
                            "audio_object_key": "audio/original/test-user-001/frag-merge/stale-file.m4a",
                            "audio_file_url": "https://client/stale-signed-url",
                            "audio_file_expires_at": "2026-03-31T01:10:00+00:00",
                        },
                    )
                ]
            ),
        )
        record = backup_repository.get_record(
            db=db,
            user_id=TEST_USER_ID,
            entity_type="fragment",
            entity_id="frag-merge",
        )
        payload = json.loads(record.payload_json or "{}")

    assert payload["body_html"] == "<p>client body v2</p>"
    assert payload["plain_text_snapshot"] == "client body v2"
    assert payload["folder_id"] == "folder-b"
    assert payload["transcript"] == "服务器转写"
    assert payload["summary"] == "服务器摘要"
    assert payload["tags"] == ["标签A", "标签B"]
    assert payload["audio_object_key"] == "audio/original/test-user-001/frag-merge/file.m4a"
    assert payload["audio_file_url"] == "https://server/new-signed-url"
    assert payload["audio_file_expires_at"] == "2026-03-31T02:00:00+00:00"


@pytest.mark.asyncio
async def test_transcriptions_require_local_fragment_id(async_client, auth_headers_factory) -> None:
    """录音上传接口现在必须显式传入本地 fragment 占位 ID。"""
    response = await async_client.post(
        "/api/transcriptions",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_fragment_tags_and_folder_counts_read_snapshot(async_client, auth_headers_factory) -> None:
    """标签聚合与文件夹计数应完全基于 backup snapshot。"""
    create_folder = await async_client.post(
        "/api/fragment-folders",
        json={"name": "快照文件夹"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_folder.status_code == 201
    folder_id = create_folder.json()["data"]["id"]

    await _push_fragment_snapshot(
        async_client,
        auth_headers_factory,
        fragment_id="frag-folder-a",
        folder_id=folder_id,
        tags=["apple", "abc"],
    )
    await _push_fragment_snapshot(
        async_client,
        auth_headers_factory,
        fragment_id="frag-folder-b",
        folder_id=None,
        tags=["apple", "banana"],
    )

    tags_response = await async_client.get(
        "/api/fragments/tags?query=ab",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert tags_response.status_code == 200
    assert [(item["tag"], item["fragment_count"]) for item in tags_response.json()["data"]["items"]] == [("abc", 1)]

    folders_response = await async_client.get(
        "/api/fragment-folders",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert folders_response.status_code == 200
    assert folders_response.json()["data"]["items"][0]["fragment_count"] == 1

    delete_response = await async_client.delete(
        f"/api/fragment-folders/{folder_id}",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert delete_response.status_code == 409


@pytest.mark.asyncio
async def test_export_fragment_reads_snapshot(async_client, auth_headers_factory) -> None:
    """fragment Markdown 导出应直接从 snapshot 读取正文。"""
    await _push_fragment_snapshot(
        async_client,
        auth_headers_factory,
        fragment_id="frag-export",
        body_html="<p>导出正文</p>",
        plain_text_snapshot="导出正文",
        tags=["导出"],
    )

    response = await async_client.get(
        "/api/exports/markdown/fragment/frag-export",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 200
    assert "导出正文" in response.text
    assert 'type: "fragment"' in response.text


@pytest.mark.asyncio
async def test_upload_audio_backfills_fragment_snapshot(async_client, auth_headers_factory, db_session_factory) -> None:
    """录音上传完成后，转写与音频对象键应补写回 fragment snapshot。"""
    await _push_fragment_snapshot(
        async_client,
        auth_headers_factory,
        fragment_id="local-fragment-upload",
        body_html="",
        plain_text_snapshot="",
    )

    response = await async_client.post(
        "/api/transcriptions",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
        data={"local_fragment_id": "local-fragment-upload"},
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    task = await _wait_task(async_client, auth_headers_factory, payload["task_id"], attempts=140)
    assert task["status"] == "succeeded"

    for _ in range(80):
        with db_session_factory() as db:
            record = backup_repository.get_record(
                db=db,
                user_id=TEST_USER_ID,
                entity_type="fragment",
                entity_id="local-fragment-upload",
            )
            snapshot_payload = json.loads(record.payload_json or "{}") if record is not None else {}
        if snapshot_payload.get("transcript") and snapshot_payload.get("audio_object_key") and snapshot_payload.get("summary"):
            break
        await asyncio.sleep(0.05)
    else:
        raise AssertionError("fragment snapshot was not backfilled")

    assert snapshot_payload["transcript"] == "转写完成"
    assert snapshot_payload["audio_object_key"]
    assert snapshot_payload["summary"]
    assert isinstance(snapshot_payload["tags"], list)


@pytest.mark.asyncio
async def test_delete_folder_counts_upload_placeholder_before_client_flush(async_client, auth_headers_factory) -> None:
    """上传成功但客户端尚未 flush 时，文件夹删除仍应被占位 snapshot 阻止。"""
    create_folder = await async_client.post(
        "/api/fragment-folders",
        json={"name": "上传占位文件夹"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert create_folder.status_code == 201
    folder_id = create_folder.json()["data"]["id"]

    upload_response = await async_client.post(
        "/api/transcriptions",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
        data={
            "local_fragment_id": "local-folder-protected",
            "folder_id": folder_id,
        },
    )
    assert upload_response.status_code == 200

    delete_response = await async_client.delete(
        f"/api/fragment-folders/{folder_id}",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert delete_response.status_code == 409
