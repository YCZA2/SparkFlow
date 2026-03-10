"""碎片可视化降级测试。"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from domains.fragments import repository as fragment_repository
from modules.fragments.visualization import build_fragment_visualization


class _FakeVectorStore:
    """提供可控 embedding 列表的向量库替身。"""

    def __init__(self):
        self._docs = []

    async def list_fragment_documents(self, *, user_id: str, include_embeddings: bool = True):
        return self._docs

    async def upsert_fragment(self, **kwargs):
        return True


@pytest.mark.asyncio
async def test_falls_back_to_text_features_when_vector_store_has_no_embeddings(db_session_factory) -> None:
    """没有 embedding 时应降级到文本特征构图。"""
    with db_session_factory() as db:
        fragment = fragment_repository.create(
            db=db,
            user_id="test-user-001",
            transcript="这是一个关于定位方法的碎片",
            capture_text="这是一个关于定位方法的碎片",
            source="manual",
            audio_source=None,
            audio_path=None,
        )
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
            capture_text="这是另一个碎片",
            source="manual",
            audio_source=None,
            audio_path=None,
        )
        store = _FakeVectorStore()
        store._docs = [SimpleNamespace(id=fragment.id, embedding=[0.1, 0.2, 0.3])]
        payload = await build_fragment_visualization(db=db, user_id="test-user-001", vector_store=store)

    assert payload["meta"]["used_vector_source"] == "vector_store"
    assert payload["stats"]["total_fragments"] == 1
