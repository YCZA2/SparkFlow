from __future__ import annotations

import json
from typing import Any

import httpx
from httpx import AsyncClient, Timeout

from modules.shared.ports import (
    WorkflowProvider,
    WorkflowProviderInvalidResponseError,
    WorkflowProviderRequestError,
    WorkflowProviderRun,
    WorkflowProviderTimeoutError,
    WorkflowProviderUpstreamError,
)

_DIFY_PROVIDER_NAME = "dify"
_QUEUED_STATUSES = {"queued", "pending", "waiting"}
_RUNNING_STATUSES = {"running", "processing", "in_progress"}
_SUCCEEDED_STATUSES = {"succeeded", "success", "completed"}
_FAILED_STATUSES = {"failed", "error", "stopped", "cancelled", "canceled"}


class DifyWorkflowProvider(WorkflowProvider):
    """Dify 外挂工作流 adapter。"""

    def __init__(
        self,
        *,
        base_url: str | None,
        api_key: str | None,
        http_client: AsyncClient | None = None,
    ) -> None:
        """初始化 Dify adapter，并封装专属 HTTP 客户端。"""
        # 中文注释：adapter 自持 HTTP 客户端，避免把 Dify 细节暴露给业务层。
        self.base_url = (base_url or "").rstrip("/")
        self.api_key = api_key
        self.http_client = http_client or AsyncClient(
            timeout=Timeout(connect=10.0, read=60.0, write=60.0, pool=60.0)
        )

    def is_configured(self) -> bool:
        """判断当前 adapter 是否具备可用配置。"""
        return bool(self.base_url and self.api_key)

    async def submit_run(self, *, inputs: dict[str, Any], user_id: str) -> WorkflowProviderRun:
        """提交一次 Dify 工作流运行。"""
        payload = await self._request(
            "POST",
            "/workflows/run",
            json={"inputs": self._build_request_inputs(inputs), "response_mode": "blocking", "user": user_id},
        )
        return self._parse_run_payload(payload.get("data") or payload, fallback_status="running")

    async def get_run(self, *, run_id: str) -> WorkflowProviderRun:
        """查询一次 Dify 工作流运行。"""
        payload = await self._request("GET", f"/workflows/run/{run_id}")
        return self._parse_run_payload(payload.get("data") or payload, fallback_status="running")

    async def aclose(self) -> None:
        """关闭内部 HTTP 客户端。"""
        await self.http_client.aclose()

    def _build_request_inputs(self, inputs: dict[str, Any]) -> dict[str, Any]:
        """把结构化上下文转换成 Dify Start 节点可消费的文本输入。"""
        normalized: dict[str, Any] = {}
        for key, value in inputs.items():
            if isinstance(value, (dict, list)):
                normalized[key] = json.dumps(value, ensure_ascii=False)
            elif value is None:
                normalized[key] = ""
            else:
                normalized[key] = value
        return normalized

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        """执行一次 Dify HTTP 请求并映射通用异常语义。"""
        if not self.is_configured():
            raise WorkflowProviderTimeoutError(provider_name=_DIFY_PROVIDER_NAME, message="Dify 未配置")
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.api_key}"
        headers["Content-Type"] = "application/json"
        try:
            response = await self.http_client.request(method, f"{self.base_url}{path}", headers=headers, **kwargs)
        except httpx.TimeoutException as exc:
            raise WorkflowProviderTimeoutError(provider_name=_DIFY_PROVIDER_NAME, message="请求 Dify 超时") from exc
        except httpx.HTTPError as exc:
            raise WorkflowProviderUpstreamError(provider_name=_DIFY_PROVIDER_NAME, message="请求 Dify 失败") from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise WorkflowProviderInvalidResponseError(provider_name=_DIFY_PROVIDER_NAME, message="Dify 返回了无效 JSON") from exc

        if not isinstance(payload, dict):
            raise WorkflowProviderInvalidResponseError(provider_name=_DIFY_PROVIDER_NAME, message="Dify 返回结构无效")
        if response.status_code >= 500:
            raise WorkflowProviderUpstreamError(provider_name=_DIFY_PROVIDER_NAME, message="Dify 服务暂时不可用")
        if response.status_code >= 400:
            message = payload.get("message") or payload.get("error") or payload.get("code") or "Dify 请求失败"
            raise WorkflowProviderRequestError(
                provider_name=_DIFY_PROVIDER_NAME,
                message=f"Dify 请求失败: {message}",
                field_errors={"dify": str(message)},
            )
        return payload

    def _parse_run_payload(self, payload: dict[str, Any], *, fallback_status: str) -> WorkflowProviderRun:
        """解析 Dify 运行载荷并映射为统一结构。"""
        if not isinstance(payload, dict):
            raise WorkflowProviderInvalidResponseError(provider_name=_DIFY_PROVIDER_NAME, message="Dify 返回结构无效")
        run_id = payload.get("id") or payload.get("workflow_run_id")
        if not isinstance(run_id, str) or not run_id.strip():
            raise WorkflowProviderInvalidResponseError(provider_name=_DIFY_PROVIDER_NAME, message="Dify 返回缺少运行 ID")
        raw_status = payload.get("status") or payload.get("workflow_run", {}).get("status") or fallback_status
        status = self._map_status(raw_status)
        outputs = payload.get("outputs")
        if outputs is None:
            outputs = payload.get("workflow_run", {}).get("outputs")
        if outputs is None:
            outputs = {}
        if not isinstance(outputs, dict):
            raise WorkflowProviderInvalidResponseError(provider_name=_DIFY_PROVIDER_NAME, message="Dify 返回的 outputs 结构无效")
        provider_run_id = payload.get("workflow_run_id")
        provider_workflow_id = payload.get("workflow_id")
        return WorkflowProviderRun(
            run_id=run_id,
            status=status,
            outputs=outputs,
            raw_payload=payload,
            provider_run_id=provider_run_id if isinstance(provider_run_id, str) else None,
            provider_workflow_id=provider_workflow_id if isinstance(provider_workflow_id, str) else None,
        )

    def _map_status(self, status: Any) -> str:
        """把 Dify 原始状态映射到内部统一状态枚举。"""
        normalized = str(status or "").strip().lower()
        if normalized in _QUEUED_STATUSES:
            return "queued"
        if normalized in _RUNNING_STATUSES:
            return "running"
        if normalized in _SUCCEEDED_STATUSES:
            return "succeeded"
        if normalized in _FAILED_STATUSES:
            return "failed"
        raise WorkflowProviderInvalidResponseError(
            provider_name=_DIFY_PROVIDER_NAME,
            message=f"Dify 返回了未知状态: {normalized or 'empty'}",
        )
