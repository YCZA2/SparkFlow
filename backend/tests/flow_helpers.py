"""后端链路测试共享辅助函数。"""

from __future__ import annotations

import asyncio
import json

import pytest
from domains.fragments import repository as fragment_repository
from domains.fragment_tags import repository as fragment_tag_repository
from models import Fragment
from modules.auth.application import TEST_USER_ID
from modules.fragments.mapper import map_fragment
from modules.shared.content.content_html import convert_markdown_to_basic_html
from modules.shared.content.fragment_body_markdown import convert_editor_document_to_body_markdown


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


async def _create_fragment(db_session_factory, payload: dict) -> dict:
    """直接写入 fragment projection，并返回与旧接口兼容的映射载荷。"""
    request_payload = dict(payload)
    if "editor_document" in request_payload:
        request_payload["body_html"] = convert_markdown_to_basic_html(
            convert_editor_document_to_body_markdown(request_payload.pop("editor_document"))
        )
    with db_session_factory() as db:
        fragment = fragment_repository.create(
            db=db,
            user_id=TEST_USER_ID,
            transcript=request_payload.get("transcript"),
            source=request_payload.get("source") or "voice",
            audio_source=request_payload.get("audio_source"),
            audio_storage_provider=None,
            audio_bucket=None,
            audio_object_key=None,
            audio_access_level=None,
            audio_original_filename=None,
            audio_mime_type=None,
            audio_file_size=None,
            audio_checksum=None,
            body_html=request_payload.get("body_html"),
            plain_text_snapshot=request_payload.get("plain_text_snapshot") or "",
            folder_id=request_payload.get("folder_id"),
            tags=[],
        )
        return map_fragment(fragment).model_dump()


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
    """把 fragment 通过备份接口写入远端快照，模拟 local-first 同步完成。"""
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
                    "payload": {
                        "id": fragment["id"],
                        "folder_id": fragment.get("folder_id"),
                        "source": fragment.get("source") or "manual",
                        "audio_source": fragment.get("audio_source"),
                        "created_at": fragment["created_at"],
                        "updated_at": fragment["updated_at"],
                        "summary": fragment.get("summary"),
                        "tags": fragment.get("tags") or [],
                        "transcript": fragment.get("transcript"),
                        "speaker_segments": fragment.get("speaker_segments"),
                        "audio_object_key": fragment.get("audio_object_key"),
                        "audio_file_url": fragment.get("audio_file_url"),
                        "audio_file_expires_at": fragment.get("audio_file_expires_at"),
                        "body_html": fragment.get("body_html") or "",
                        "plain_text_snapshot": fragment.get("plain_text_snapshot") or "",
                        "content_state": fragment.get("content_state"),
                        "is_filmed": fragment.get("is_filmed") or False,
                        "filmed_at": fragment.get("filmed_at"),
                        "deleted_at": fragment.get("deleted_at"),
                    },
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


async def _wait_fragment_derivatives(db_session_factory, fragment_id: str, *, attempts: int = 80) -> Fragment:
    """轮询数据库直到摘要标签衍生字段补齐。"""
    for _ in range(attempts):
        with db_session_factory() as db:
            fragment = db.query(Fragment).filter(Fragment.id == fragment_id).first()
            if fragment is not None and (fragment.summary or fragment.tags not in (None, "[]")):
                return fragment
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


def _seed_fragment_tags(db_session_factory, fragment_id: str, tags: list[str]) -> None:
    """直接写库补齐标签聚合测试所需数据。"""
    with db_session_factory() as db:
        fragment = db.query(Fragment).filter(Fragment.id == fragment_id).first()
        assert fragment is not None
        fragment.tags = json.dumps(tags, ensure_ascii=False)
        fragment_tag_repository.replace_for_fragment(
            db=db,
            user_id=TEST_USER_ID,
            fragment_id=fragment_id,
            tags=tags,
        )
        db.commit()


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
