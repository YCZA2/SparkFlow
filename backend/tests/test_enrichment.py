from __future__ import annotations

import pytest

from modules.shared.enrichment import generate_summary_and_tags


class ExplodingLLMProvider:
    """在增强调用时稳定抛错，验证兜底与日志限频行为。"""

    async def generate(self, **kwargs) -> str:
        """模拟外部 LLM 服务不可用。"""
        raise RuntimeError("llm unavailable")


class StubLogger:
    """记录 warning/debug 调用，验证日志是否被限频。"""

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
async def test_generate_summary_and_tags_falls_back_when_llm_fails(monkeypatch) -> None:
    """LLM 不可用时应回退本地摘要标签，而不是把异常抛给调用方。"""
    stub_logger = StubLogger()
    monotonic_values = iter([100.0, 100.0, 100.0, 100.0])

    monkeypatch.setattr("modules.shared.enrichment.logger", stub_logger)
    monkeypatch.setattr("modules.shared.enrichment.time.monotonic", lambda: next(monotonic_values))
    monkeypatch.setattr("modules.shared.enrichment._enrichment_warning_last_seen", {})

    summary, tags = await generate_summary_and_tags(
        "这是一段关于产品增长的长文本，用来验证摘要标签失败时会走本地兜底逻辑。",
        llm_provider=ExplodingLLMProvider(),
    )

    assert summary.startswith("这是一段关于产品增长")
    assert tags == ["产品", "设计"]
    # 现在摘要本地提取不调用 LLM，只有标签生成会失败并产生 warning
    assert len(stub_logger.warning_calls) == 1
    assert stub_logger.warning_calls[0][0] == "enrichment_generation_failed"
    assert stub_logger.warning_calls[0][1]["phase"] == "tags"


@pytest.mark.asyncio
async def test_generate_summary_and_tags_throttles_duplicate_failures(monkeypatch) -> None:
    """相同增强错误在冷却窗口内应只保留一次 warning。"""
    stub_logger = StubLogger()
    monotonic_values = iter([100.0, 100.0, 101.0, 101.0, 110.0, 110.0, 111.0, 111.0])

    monkeypatch.setattr("modules.shared.enrichment.logger", stub_logger)
    monkeypatch.setattr("modules.shared.enrichment.time.monotonic", lambda: next(monotonic_values))
    monkeypatch.setattr("modules.shared.enrichment._enrichment_warning_last_seen", {})

    transcript = "这是一段关于产品增长的长文本，用来验证摘要标签失败时会走本地兜底逻辑。"
    provider = ExplodingLLMProvider()

    await generate_summary_and_tags(transcript, llm_provider=provider)
    await generate_summary_and_tags(transcript, llm_provider=provider)

    # 现在只有标签生成会调用 LLM，第一次失败产生 warning，第二次被限频产生 debug
    assert len(stub_logger.warning_calls) == 1
    assert stub_logger.warning_calls[0][1]["phase"] == "tags"
    assert len(stub_logger.debug_calls) == 1
    assert stub_logger.debug_calls[0][0] == "enrichment_generation_failed_suppressed"
    assert stub_logger.debug_calls[0][1]["phase"] == "tags"
