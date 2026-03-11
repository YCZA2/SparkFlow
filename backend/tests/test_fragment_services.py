from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from core.exceptions import NotFoundError
from modules.fragments.asset_binding_service import FragmentAssetBindingService
from modules.fragments.derivative_service import FragmentDerivativeService
from tests.support import FakeLLMProvider, FakeVectorStore


class StubDbSession:
    """提供最小 commit 能力的数据库替身。"""

    def __init__(self) -> None:
        """记录 commit 次数，便于断言衍生回写发生。"""
        self.commit_calls = 0

    def commit(self) -> None:
        """模拟事务提交。"""
        self.commit_calls += 1


class ExplodingVectorStore:
    """在向量同步时抛错，验证正文保存链路的降级行为。"""

    async def upsert_fragment(self, **kwargs) -> bool:
        raise RuntimeError("vector unavailable")

    async def delete_fragment(self, **kwargs) -> bool:
        raise RuntimeError("vector unavailable")


@pytest.mark.asyncio
async def test_derivative_service_skips_enrichment_for_small_edits() -> None:
    """小改动时应复用已有摘要标签，只同步向量。"""
    db = StubDbSession()
    fragment = SimpleNamespace(id="frag-1", source="manual", summary="已有摘要", tags=json.dumps(["旧标签"], ensure_ascii=False))
    vector_store = FakeVectorStore()
    llm_provider = FakeLLMProvider()
    service = FragmentDerivativeService(vector_store=vector_store, llm_provider=llm_provider)

    await service.refresh_fragment_derivatives(
        db=db,
        user_id="test-user-001",
        fragment=fragment,
        previous_effective_text="这是一段足够长的原始内容，用来验证小改动不会触发重算。",
        current_effective_text="这是一段足够长的原始内容，用来验证小改动不会触发重算。!",
    )

    assert llm_provider.calls == []
    assert db.commit_calls == 0
    assert vector_store.fragment_docs[fragment.id]["summary"] == "已有摘要"
    assert vector_store.fragment_docs[fragment.id]["tags"] == ["旧标签"]


@pytest.mark.asyncio
async def test_derivative_service_refreshes_summary_and_tags_for_large_edits(monkeypatch) -> None:
    """大改动时应重算摘要标签并更新向量。"""
    replaced_tags: list[str] = []

    def _fake_replace_for_fragment(*, db, user_id: str, fragment_id: str, tags: list[str]) -> None:
        """记录标签回写结果，避免依赖真实仓储。"""
        replaced_tags[:] = tags

    monkeypatch.setattr("modules.fragments.derivative_service.fragment_tag_repository.replace_for_fragment", _fake_replace_for_fragment)

    db = StubDbSession()
    fragment = SimpleNamespace(id="frag-2", source="manual", summary=None, tags=None)
    vector_store = FakeVectorStore()
    llm_provider = FakeLLMProvider()
    llm_provider.queue_text('["产品", "增长"]')
    service = FragmentDerivativeService(vector_store=vector_store, llm_provider=llm_provider)

    await service.refresh_fragment_derivatives(
        db=db,
        user_id="test-user-001",
        fragment=fragment,
        previous_effective_text="旧内容",
        current_effective_text="这是一次足够长的内容重写，用来触发摘要与标签刷新逻辑，并同步向量结果。",
    )

    assert len(llm_provider.calls) == 2
    assert db.commit_calls == 1
    assert replaced_tags == ["产品", "增长"]
    assert json.loads(fragment.tags) == ["产品", "增长"]
    assert vector_store.fragment_docs[fragment.id]["text"].startswith("这是一次足够长的内容重写")


@pytest.mark.asyncio
async def test_derivative_service_degrades_when_vector_sync_fails(monkeypatch) -> None:
    """向量同步失败时不应阻断正文衍生字段刷新。"""
    replaced_tags: list[str] = []

    def _fake_replace_for_fragment(*, db, user_id: str, fragment_id: str, tags: list[str]) -> None:
        """记录标签回写结果，避免依赖真实仓储。"""
        replaced_tags[:] = tags

    monkeypatch.setattr("modules.fragments.derivative_service.fragment_tag_repository.replace_for_fragment", _fake_replace_for_fragment)

    db = StubDbSession()
    fragment = SimpleNamespace(id="frag-3", source="manual", summary=None, tags=None)
    llm_provider = FakeLLMProvider()
    llm_provider.queue_text('["编辑", "整理"]')
    service = FragmentDerivativeService(vector_store=ExplodingVectorStore(), llm_provider=llm_provider)

    await service.refresh_fragment_derivatives(
        db=db,
        user_id="test-user-001",
        fragment=fragment,
        previous_effective_text="旧内容",
        current_effective_text="这是一段足够长的重写正文，用来验证向量同步失败时，正文保存和摘要标签刷新仍然可以成功结束。",
    )

    assert db.commit_calls == 1
    assert replaced_tags == ["编辑", "整理"]
    assert json.loads(fragment.tags) == ["编辑", "整理"]


def test_asset_binding_service_replace_media_assets_is_idempotent(monkeypatch) -> None:
    """替换素材绑定时应去重并清理旧关联。"""
    current_assets = [SimpleNamespace(id="asset-a"), SimpleNamespace(id="asset-b")]
    target_assets = {
        "asset-a": SimpleNamespace(id="asset-a"),
        "asset-b": SimpleNamespace(id="asset-b"),
        "asset-c": SimpleNamespace(id="asset-c"),
    }
    detached: list[str] = []
    attached: list[str] = []

    def _fake_list_content_assets(*, db, user_id: str, content_type: str, content_id: str):
        """返回当前已绑定素材列表。"""
        return list(current_assets)

    def _fake_get_by_id(*, db, user_id: str, asset_id: str):
        """返回存在的素材对象。"""
        return target_assets.get(asset_id)

    def _fake_attach_to_content(*, db, user_id: str, media_asset_id: str, content_type: str, content_id: str):
        """记录新增绑定。"""
        attached.append(media_asset_id)

    def _fake_detach_from_content(*, db, user_id: str, content_type: str, content_id: str, media_asset_id: str):
        """记录移除绑定。"""
        detached.append(media_asset_id)

    monkeypatch.setattr("modules.fragments.asset_binding_service.media_asset_repository.list_content_assets", _fake_list_content_assets)
    monkeypatch.setattr("modules.fragments.asset_binding_service.media_asset_repository.get_by_id", _fake_get_by_id)
    monkeypatch.setattr("modules.fragments.asset_binding_service.media_asset_repository.attach_to_content", _fake_attach_to_content)
    monkeypatch.setattr("modules.fragments.asset_binding_service.media_asset_repository.detach_from_content", _fake_detach_from_content)

    service = FragmentAssetBindingService()
    service.replace_media_assets(
        db=object(),
        user_id="test-user-001",
        content_type="fragment",
        content_id="frag-1",
        media_asset_ids=["asset-c", "asset-c"],
    )

    assert sorted(detached) == ["asset-a", "asset-b"]
    assert attached == ["asset-c"]


def test_asset_binding_service_rejects_missing_asset(monkeypatch) -> None:
    """绑定不存在素材时应抛出统一异常。"""
    monkeypatch.setattr("modules.fragments.asset_binding_service.media_asset_repository.get_by_id", lambda **_: None)

    service = FragmentAssetBindingService()

    with pytest.raises(NotFoundError, match="媒体资源不存在或无权访问"):
        service.attach_media_assets(
            db=object(),
            user_id="test-user-001",
            content_type="fragment",
            content_id="frag-1",
            media_asset_ids=["missing-asset"],
        )
