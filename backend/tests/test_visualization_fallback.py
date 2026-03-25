"""碎片可视化降级测试。"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from domains.backups import repository as backup_repository
from domains.fragments import repository as fragment_repository
from modules.fragments.visualization import build_fragment_visualization

pytestmark = pytest.mark.integration


class _FakeVectorStore:
    """提供可控 embedding 列表的向量库替身。"""

    def __init__(self):
        self._docs = []

    async def list_fragment_documents(self, *, user_id: str, include_embeddings: bool = True):
        return self._docs

    async def upsert_fragment(self, **kwargs):
        return True

    async def delete_fragment(self, *, user_id: str, fragment_id: str):
        """兼容可视化链路的删除调用。"""
        return True


def _upsert_fragment_snapshot(db, fragment) -> None:
    """把测试碎片同步成 snapshot，供可视化链路读取。"""
    backup_repository.upsert_record(
        db=db,
        user_id=fragment.user_id,
        entity_type="fragment",
        entity_id=fragment.id,
        entity_version=1,
        operation="upsert",
        payload_json=json.dumps(
            {
                "id": fragment.id,
                "source": fragment.source,
                "created_at": fragment.created_at.isoformat(),
                "updated_at": fragment.updated_at.isoformat(),
                "body_html": fragment.body_html or "",
                "plain_text_snapshot": fragment.plain_text_snapshot or "",
                "transcript": fragment.transcript,
                "summary": fragment.summary,
                "tags": [],
                "deleted_at": None,
            },
            ensure_ascii=False,
        ),
        modified_at=fragment.updated_at,
        last_modified_device_id="device-test",
        now=fragment.updated_at,
    )


@pytest.mark.asyncio
async def test_falls_back_to_text_features_when_vector_store_has_no_embeddings(db_session_factory) -> None:
    """没有 embedding 时应降级到文本特征构图。"""
    with db_session_factory() as db:
        fragment = fragment_repository.create(
            db=db,
            user_id="test-user-001",
            transcript="这是一个关于定位方法的碎片",
            source="voice",
            audio_source=None,
            audio_storage_provider=None,
            audio_bucket=None,
            audio_object_key=None,
            audio_access_level=None,
            audio_original_filename=None,
            audio_mime_type=None,
            audio_file_size=None,
            audio_checksum=None,
        )
        _upsert_fragment_snapshot(db, fragment)
        store = _FakeVectorStore()
        payload = await build_fragment_visualization(db=db, user_id="test-user-001", vector_store=store)

    assert payload["meta"]["used_vector_source"] == "fallback_text_features"
    assert payload["stats"]["total_fragments"] == 1
    assert payload["points"][0]["id"] == fragment.id


@pytest.mark.asyncio
async def test_uses_vector_store_when_embeddings_exist(db_session_factory) -> None:
    """存在 embedding 时应优先使用向量库结果。"""
    with db_session_factory() as db:
        fragment = fragment_repository.create(
            db=db,
            user_id="test-user-001",
            transcript="这是另一个碎片",
            source="voice",
            audio_source=None,
            audio_storage_provider=None,
            audio_bucket=None,
            audio_object_key=None,
            audio_access_level=None,
            audio_original_filename=None,
            audio_mime_type=None,
            audio_file_size=None,
            audio_checksum=None,
        )
        _upsert_fragment_snapshot(db, fragment)
        store = _FakeVectorStore()
        store._docs = [SimpleNamespace(id=fragment.id, embedding=[0.1, 0.2, 0.3])]
        payload = await build_fragment_visualization(db=db, user_id="test-user-001", vector_store=store)

    assert payload["meta"]["used_vector_source"] == "vector_store"
    assert payload["stats"]["total_fragments"] == 1
