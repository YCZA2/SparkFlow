from __future__ import annotations

import time

import pytest

from modules.fragments.application import FragmentQueryService
from modules.fragments.derivative_service import FragmentDerivativeService
from modules.shared.fragment_snapshots import FragmentSnapshotReader
from tests.support import FakeLLMProvider, FakeVectorStore


class StubDbSession:
    """提供最小 query 能力判定所需的数据库替身。"""

    def __init__(self) -> None:
        """记录 commit 次数，便于确认单测不会误碰真实 snapshot 持久化。"""
        self.commit_calls = 0

    def commit(self) -> None:
        """记录 commit 调用次数，确保衍生服务不会误提交单测替身。"""
        self.commit_calls += 1


class ExplodingVectorStore:
    """在向量同步时抛错，验证衍生链路的降级行为。"""

    async def upsert_fragment(self, **kwargs) -> bool:
        raise RuntimeError("vector unavailable")

    async def delete_fragment(self, **kwargs) -> bool:
        raise RuntimeError("vector unavailable")


class StubLogger:
    """记录 warning/debug 调用，供日志限频断言复用。"""

    def __init__(self) -> None:
        """初始化日志记录容器。"""
        self.warning_calls: list[tuple[str, dict[str, object]]] = []
        self.debug_calls: list[tuple[str, dict[str, object]]] = []

    def warning(self, event: str, **kwargs) -> None:
        """记录 warning 级别日志。"""
        self.warning_calls.append((event, kwargs))

    def debug(self, event: str, **kwargs) -> None:
        """记录 debug 级别日志。"""
        self.debug_calls.append((event, kwargs))


@pytest.mark.asyncio
async def test_derivative_service_backfills_snapshot_summary_tags_and_vector() -> None:
    """衍生回填应生成摘要标签并同步向量。"""
    db = StubDbSession()
    vector_store = FakeVectorStore()
    llm_provider = FakeLLMProvider()
    llm_provider.queue_text('["产品", "增长"]')
    service = FragmentDerivativeService(vector_store=vector_store, llm_provider=llm_provider)

    summary, tags, purpose = await service.backfill_snapshot_derivatives(
        db=db,
        user_id="test-user-001",
        fragment_id="frag-2",
        source="manual",
        effective_text="这是一次足够长的内容重写，用来触发摘要与标签刷新逻辑，并同步向量结果。",
    )

    assert len(llm_provider.calls) == 2
    assert db.commit_calls == 0
    assert summary
    assert tags == ["产品", "增长"]
    assert purpose == "content_material"
    assert vector_store.fragment_docs["frag-2"]["text"].startswith("这是一次足够长的内容重写")


@pytest.mark.asyncio
async def test_derivative_service_degrades_when_vector_sync_fails() -> None:
    """向量同步失败时不应阻断摘要标签刷新。"""
    db = StubDbSession()
    llm_provider = FakeLLMProvider()
    llm_provider.queue_text('["编辑", "整理"]')
    service = FragmentDerivativeService(vector_store=ExplodingVectorStore(), llm_provider=llm_provider)

    summary, tags, purpose = await service.backfill_snapshot_derivatives(
        db=db,
        user_id="test-user-001",
        fragment_id="frag-3",
        source="manual",
        effective_text="这是一段足够长的重写正文，用来验证向量同步失败时，摘要标签刷新仍然可以成功结束。",
    )

    assert summary
    assert tags == ["编辑", "整理"]
    assert purpose == "content_material"


@pytest.mark.asyncio
async def test_derivative_service_throttles_duplicate_vector_sync_warnings(monkeypatch) -> None:
    """同一条向量同步错误在冷却窗口内应只保留一次 warning。"""
    service = FragmentDerivativeService(vector_store=ExplodingVectorStore(), llm_provider=FakeLLMProvider())
    stub_logger = StubLogger()
    monotonic_values = iter([100.0] * 20)
    real_monotonic = time.monotonic

    def _fake_monotonic() -> float:
        """优先返回编排时间点，耗尽后回退真实时钟，避免影响 asyncio 清理。"""
        try:
            return next(monotonic_values)
        except StopIteration:
            return real_monotonic()

    monkeypatch.setattr("modules.fragments.derivative_service.logger", stub_logger)
    monkeypatch.setattr("modules.fragments.derivative_service.time.monotonic", _fake_monotonic)
    monkeypatch.setattr("modules.fragments.derivative_service._vector_sync_throttle._last_seen", {})

    await service.backfill_snapshot_derivatives(
        db=StubDbSession(),
        user_id="test-user-001",
        fragment_id="frag-4",
        source="manual",
        effective_text="这是一段足够长的原始内容，用来验证重复向量同步错误会被限频。",
    )
    await service.backfill_snapshot_derivatives(
        db=StubDbSession(),
        user_id="test-user-001",
        fragment_id="frag-4",
        source="manual",
        effective_text="这是一段足够长的原始内容，用来验证重复向量同步错误会被限频。",
    )

    assert len(stub_logger.warning_calls) == 1
    assert stub_logger.warning_calls[0][0] == "fragment_vector_sync_failed"
    assert len(stub_logger.debug_calls) == 1
    assert stub_logger.debug_calls[0][0] == "fragment_vector_sync_failed_suppressed"


def test_fragment_query_service_list_tags_reads_snapshot(db_session_factory) -> None:
    """标签聚合应直接扫描 fragment snapshot，而不是依赖 fragment_tags 表。"""
    reader = FragmentSnapshotReader()
    with db_session_factory() as db:
        reader.merge_server_fields(
            db=db,
            user_id="test-user-001",
            fragment_id="frag-a",
            source="manual",
            server_patch={"tags": ["apple", "abc", "apple"]},
        )
        reader.merge_server_fields(
            db=db,
            user_id="test-user-001",
            fragment_id="frag-b",
            source="manual",
            server_patch={"tags": ["apple", "banana"]},
        )
        payload = FragmentQueryService(vector_store=FakeVectorStore()).list_tags(
            db=db,
            user_id="test-user-001",
            query_text="ab",
            limit=10,
        )

    assert [(item.tag, item.fragment_count) for item in payload.items] == [("abc", 1)]
