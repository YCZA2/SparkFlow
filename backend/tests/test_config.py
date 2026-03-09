"""配置解析测试。"""

from __future__ import annotations

from core.config import Settings


def test_debug_accepts_legacy_release_value(monkeypatch) -> None:
    """兼容历史 release/debug 风格的 DEBUG 配置。"""
    monkeypatch.setenv("DEBUG", "release")
    settings = Settings()
    assert settings.DEBUG is False


def test_dashscope_strategy_defaults_to_realtime(monkeypatch) -> None:
    """在未显式配置时仍保持实时转写默认值。"""
    monkeypatch.delenv("STT_DASHSCOPE_STRATEGY", raising=False)
    settings = Settings()
    assert settings.STT_DASHSCOPE_STRATEGY == "realtime"


def test_dify_base_url_is_normalized(monkeypatch) -> None:
    """自动移除 Dify 基础地址末尾斜杠。"""
    monkeypatch.setenv("DIFY_BASE_URL", "https://dify.example.com/v1/")
    settings = Settings()
    assert settings.DIFY_BASE_URL == "https://dify.example.com/v1"
