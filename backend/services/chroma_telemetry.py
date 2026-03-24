"""Chroma telemetry 适配。"""

from __future__ import annotations

from chromadb.config import System
from chromadb.telemetry.product import ProductTelemetryClient, ProductTelemetryEvent
from overrides import override


class NoOpProductTelemetryClient(ProductTelemetryClient):
    """禁用 Chroma 产品埋点，避免本地依赖兼容噪音。"""

    def __init__(self, system: System) -> None:
        """保留标准初始化签名，便于 Chroma 组件按字符串路径装配。"""
        super().__init__(system)

    @override
    def capture(self, event: ProductTelemetryEvent) -> None:
        """吞掉所有 telemetry 事件，避免写入无意义错误日志。"""
        return None
