from __future__ import annotations

from core.config import Settings
from services.dify_workflow_provider import DifyWorkflowProvider
from services.external_media import ExternalMediaService

from .ports import ExternalMediaProvider, WebSearchProvider, WebSearchResult, WorkflowProvider


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


def create_script_mode_a_workflow_provider(*, settings: Settings) -> WorkflowProvider:
    """构造 mode_a 脚本工作流 provider。"""
    return DifyWorkflowProvider(
        base_url=settings.DIFY_MODE_A_BASE_URL,
        api_key=settings.DIFY_MODE_A_API_KEY,
    )


def create_script_mode_b_workflow_provider(*, settings: Settings) -> WorkflowProvider:
    """构造 mode_b 脚本工作流 provider。"""
    return DifyWorkflowProvider(
        base_url=settings.DIFY_MODE_B_BASE_URL,
        api_key=settings.DIFY_MODE_B_API_KEY,
    )


def create_daily_push_workflow_provider(*, settings: Settings) -> WorkflowProvider:
    """构造每日推盘专用的外挂工作流 provider。"""
    return DifyWorkflowProvider(
        base_url=settings.DIFY_BASE_URL,
        api_key=settings.DIFY_DAILY_PUSH_API_KEY or settings.DIFY_API_KEY,
    )
