"""后端链路测试共享辅助函数。"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from domains.backups import repository as backup_repository
from modules.auth.application import TEST_USER_ID
from modules.shared.content.content_html import convert_markdown_to_basic_html, extract_plain_text_from_html
from modules.shared.content.fragment_body_markdown import convert_editor_document_to_body_markdown
from modules.shared.fragment_snapshots import FragmentSnapshotReader

_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


def _editor_document(text: str) -> dict:
    """构造测试用的最小富文本文档载荷。"""
    normalized = text.strip()
    return {
        "type": "doc",
        "blocks": []
        if not normalized
        else [
            {
                "id": "test-block-1",
                "type": "paragraph",
                "children": [{"text": normalized, "marks": []}],
            }
        ],
    }


async def _auth_headers(async_client, auth_headers_factory) -> dict[str, str]:
    """生成带 Bearer Token 的请求头。"""
    return await auth_headers_factory(async_client)


def _build_fragment_payload(payload: dict, *, fragment_id: str | None = None) -> dict:
    """把测试输入规整成 fragment snapshot 载荷。"""
    request_payload = dict(payload)
    if "editor_document" in request_payload:
        request_payload["body_html"] = convert_markdown_to_basic_html(
            convert_editor_document_to_body_markdown(request_payload.pop("editor_document"))
        )
    body_html = str(request_payload.get("body_html") or "")
    plain_text_snapshot = str(
        request_payload.get("plain_text_snapshot")
        or extract_plain_text_from_html(body_html)
        or request_payload.get("transcript")
        or ""
    ).strip()
    now = datetime.now(timezone.utc).isoformat()
    resolved_id = str(fragment_id or request_payload.get("id") or uuid4())
    return {
        "id": resolved_id,
        "folder_id": request_payload.get("folder_id"),
        "source": request_payload.get("source") or "manual",
        "audio_source": request_payload.get("audio_source"),
        "created_at": str(request_payload.get("created_at") or now),
        "updated_at": str(request_payload.get("updated_at") or now),
        "summary": request_payload.get("summary"),
        "tags": list(request_payload.get("tags") or []),
        "transcript": request_payload.get("transcript"),
        "speaker_segments": request_payload.get("speaker_segments"),
        "audio_object_key": request_payload.get("audio_object_key"),
        "audio_file_url": request_payload.get("audio_file_url"),
        "audio_file_expires_at": request_payload.get("audio_file_expires_at"),
        "body_html": body_html,
        "plain_text_snapshot": plain_text_snapshot,
        "content_state": request_payload.get("content_state") or ("body_present" if plain_text_snapshot else "empty"),
        "is_filmed": bool(request_payload.get("is_filmed")),
        "filmed_at": request_payload.get("filmed_at"),
        "deleted_at": request_payload.get("deleted_at"),
    }


def _upsert_fragment_snapshot(db_session_factory, fragment: dict, *, operation: str = "upsert") -> None:
    """直接写入 fragment snapshot，供测试模拟 local-first flush。"""
    with db_session_factory() as db:
        record = backup_repository.get_record(
            db=db,
            user_id=TEST_USER_ID,
            entity_type="fragment",
            entity_id=fragment["id"],
        )
        entity_version = (record.entity_version + 1) if record is not None else 1
        modified_at = datetime.fromisoformat(str(fragment["updated_at"]).replace("Z", "+00:00"))
        backup_repository.upsert_record(
            db=db,
            user_id=TEST_USER_ID,
            entity_type="fragment",
            entity_id=fragment["id"],
            entity_version=entity_version,
            operation=operation,
            payload_json=json.dumps(fragment, ensure_ascii=False),
            modified_at=modified_at,
            last_modified_device_id="device-test",
            now=datetime.now(timezone.utc),
        )
        db.commit()


async def _create_fragment(db_session_factory, payload: dict) -> dict:
    """创建测试 fragment，并同步一条本地真值 snapshot。"""
    fragment = _build_fragment_payload(payload)
    _upsert_fragment_snapshot(db_session_factory, fragment)
    return fragment


async def _create_folder(async_client, auth_headers_factory, name: str) -> str:
    """通过 API 创建文件夹并返回其 ID。"""
    response = await async_client.post(
        "/api/fragment-folders",
        json={"name": name},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


async def _backup_fragment(async_client, auth_headers_factory, fragment: dict) -> None:
    """把 fragment 通过备份接口写入远端快照，模拟客户端主动 flush。"""
    response = await async_client.post(
        "/api/backups/batch",
        json={
            "items": [
                {
                    "entity_type": "fragment",
                    "entity_id": fragment["id"],
                    "entity_version": 1,
                    "operation": "upsert",
                    "modified_at": fragment["updated_at"],
                    "payload": fragment,
                }
            ]
        },
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 200


async def _wait_pipeline(async_client, auth_headers_factory, run_id: str, *, attempts: int = 40) -> dict:
    """轮询后台流水线直到进入终态。"""
    headers = await _auth_headers(async_client, auth_headers_factory)
    for _ in range(attempts):
        response = await async_client.get(f"/api/pipelines/{run_id}", headers=headers)
        assert response.status_code == 200
        payload = response.json()["data"]
        if payload["status"] in {"succeeded", "failed"}:
            return payload
        await asyncio.sleep(0.05)
    raise AssertionError(f"pipeline {run_id} did not finish")


async def _wait_fragment_derivatives(db_session_factory, fragment_id: str, *, attempts: int = 80):
    """轮询 snapshot，直到摘要或标签等衍生字段补齐。"""
    for _ in range(attempts):
        with db_session_factory() as db:
            snapshot = _FRAGMENT_SNAPSHOT_READER.get_by_id(
                db=db,
                user_id=TEST_USER_ID,
                fragment_id=fragment_id,
            )
            if snapshot is not None and (snapshot.summary or snapshot.tags):
                return snapshot
        await asyncio.sleep(0.05)
    raise AssertionError(f"fragment derivatives were not backfilled: {fragment_id}")


async def _wait_vector_doc(app, fragment_id: str, *, attempts: int = 80) -> dict:
    """轮询直到内存向量库写入指定 fragment 文档。"""
    for _ in range(attempts):
        payload = app.state.container.vector_store.fragment_docs.get(fragment_id)
        if payload is not None:
            return payload
        await asyncio.sleep(0.05)
    raise AssertionError(f"vector doc was not backfilled: {fragment_id}")


def _update_fragment_snapshot(db_session_factory, fragment_id: str, **changes) -> dict:
    """按客户端语义更新一条 fragment snapshot。"""
    with db_session_factory() as db:
        record = backup_repository.get_record(
            db=db,
            user_id=TEST_USER_ID,
            entity_type="fragment",
            entity_id=fragment_id,
        )
        assert record is not None
        payload = json.loads(record.payload_json or "{}")
    payload.update(changes)
    payload["id"] = fragment_id
    payload["updated_at"] = datetime.now(timezone.utc).isoformat()
    _upsert_fragment_snapshot(db_session_factory, payload)
    return payload


def _delete_fragment_snapshot(db_session_factory, fragment_id: str) -> None:
    """把目标 fragment 标记删除，模拟本地 tombstone 已同步。"""
    payload = _update_fragment_snapshot(
        db_session_factory,
        fragment_id,
        deleted_at=datetime.now(timezone.utc).isoformat(),
    )
    _upsert_fragment_snapshot(db_session_factory, payload)


def _seed_fragment_tags(db_session_factory, fragment_id: str, tags: list[str]) -> None:
    """直接补写 snapshot 标签，供标签聚合测试复用。"""
    _update_fragment_snapshot(db_session_factory, fragment_id, tags=tags)


def _seed_fragment_vector(app, fragment_id: str, text: str, *, source: str = "manual") -> None:
    """向内存向量库写入碎片 embedding 测试数据。"""
    app.state.container.vector_store.fragment_docs[fragment_id] = {
        "user_id": TEST_USER_ID,
        "fragment_id": fragment_id,
        "text": text,
        "source": source,
        "summary": None,
        "tags": [],
    }


def _read_fragment_snapshot(db_session_factory, fragment_id: str):
    """读取单条 fragment snapshot，供流程断言复用。"""
    with db_session_factory() as db:
        snapshot = _FRAGMENT_SNAPSHOT_READER.get_by_id(
            db=db,
            user_id=TEST_USER_ID,
            fragment_id=fragment_id,
        )
        if snapshot is None:
            return None
        return SimpleNamespace(**json.loads(json.dumps(snapshot, default=str)))
