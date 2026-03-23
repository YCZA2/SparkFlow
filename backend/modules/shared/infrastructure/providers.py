from __future__ import annotations

from core.config import Settings
from services.dify_workflow_provider import DifyWorkflowProvider
from services.external_media import ExternalMediaService

from modules.shared.ports import ExternalMediaProvider, WebSearchProvider, WebSearchResult, WorkflowProvider


class NoopWebSearchProvider(WebSearchProvider):
    """提供默认的空网页搜索实现。"""

    async def search(self, *, query_text: str, top_k: int) -> list[WebSearchResult]:
        """返回空搜索结果，避免默认请求出网。"""
        return []


def create_external_media_provider() -> ExternalMediaProvider:
    """构造外部媒体解析 provider。"""
    return ExternalMediaService()


def create_web_search_provider() -> WebSearchProvider:
    """构造默认网页搜索 provider。"""
    return NoopWebSearchProvider()


def create_daily_push_workflow_provider(*, settings: Settings) -> WorkflowProvider:
    """构造每日推盘专用的外挂工作流 provider。"""
    cfg = settings.dify_daily_push
    return DifyWorkflowProvider(base_url=cfg.base_url, api_key=cfg.api_key)
