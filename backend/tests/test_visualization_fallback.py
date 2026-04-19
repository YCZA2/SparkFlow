"""碎片可视化降级测试。"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from domains.backups import repository as backup_repository
from modules.fragments.visualization import build_fragment_visualization

pytestmark = pytest.mark.integration


class _FakeVectorStore:
    """提供可控 embedding 列表的向量库替身。"""

    def __init__(self):
        """初始化向量文档容器。"""
        self._docs = []

    async def list_fragment_documents(self, *, user_id: str, include_embeddings: bool = True):
        """按测试预设返回向量文档。"""
        return self._docs

    async def upsert_fragment(self, **kwargs):
        """模拟云图缺失向量时的回填写入。"""
        return True

    async def delete_fragment(self, *, user_id: str, fragment_id: str):
        """模拟可视化链路的删除调用。"""
        return True


def _upsert_fragment_snapshot(db, *, fragment_id: str, transcript: str) -> None:
    """写入一条可被可视化读取的 fragment snapshot。"""
    now = datetime.now(timezone.utc)
    backup_repository.upsert_record(
        db=db,
        user_id="test-user-001",
        entity_type="fragment",
        entity_id=fragment_id,
        entity_version=1,
        operation="upsert",
        payload_json=json.dumps(
            {
                "id": fragment_id,
                "source": "voice",
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "body_html": f"<p>{transcript}</p>",
                "plain_text_snapshot": transcript,
                "transcript": transcript,
                "summary": None,
                "tags": [],
                "deleted_at": None,
            },
            ensure_ascii=False,
        ),
        modified_at=now,
        last_modified_device_id="device-test",
        now=now,
    )


@pytest.mark.asyncio
async def test_falls_back_to_text_features_when_vector_store_has_no_embeddings(db_session_factory) -> None:
    """没有 embedding 时应降级到文本特征构图。"""
    with db_session_factory() as db:
        _upsert_fragment_snapshot(db, fragment_id="visual-fragment-001", transcript="这是一个关于定位方法的碎片")
        db.commit()
        store = _FakeVectorStore()
        payload = await build_fragment_visualization(db=db, user_id="test-user-001", vector_store=store)

    assert payload["meta"]["used_vector_source"] == "fallback_text_features"
    assert payload["stats"]["total_fragments"] == 1
    assert payload["points"][0]["id"] == "visual-fragment-001"


@pytest.mark.asyncio
async def test_uses_vector_store_when_embeddings_exist(db_session_factory) -> None:
    """存在 embedding 时应优先使用向量库结果。"""
    with db_session_factory() as db:
        _upsert_fragment_snapshot(db, fragment_id="visual-fragment-002", transcript="这是另一个碎片")
        db.commit()
        store = _FakeVectorStore()
        store._docs = [SimpleNamespace(id="visual-fragment-002", embedding=[0.1, 0.2, 0.3])]
        payload = await build_fragment_visualization(db=db, user_id="test-user-001", vector_store=store)

    assert payload["meta"]["used_vector_source"] == "vector_store"
    assert payload["stats"]["total_fragments"] == 1
