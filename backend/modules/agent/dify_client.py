from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from core.exceptions import ServiceUnavailableError, ValidationError


@dataclass
class DifyWorkflowRun:
    run_id: str
    workflow_run_id: str | None
    workflow_id: str | None
    status: str
    outputs: dict[str, Any]
    raw_payload: dict[str, Any]


class DifyClient:
    def __init__(self, *, base_url: str | None, api_key: str | None, http_client: httpx.AsyncClient) -> None:
        self.base_url = (base_url or "").rstrip("/")
        self.api_key = api_key
        self.http_client = http_client

    def is_configured(self) -> bool:
        return bool(self.base_url and self.api_key)

    async def submit_workflow_run(self, *, inputs: dict[str, Any], user: str) -> DifyWorkflowRun:
        payload = await self._request("POST", "/workflows/run", json={"inputs": inputs, "response_mode": "blocking", "user": user})
        data = payload.get("data") or payload
        run_id = data.get("id") or data.get("workflow_run_id")
        if not run_id:
            raise ServiceUnavailableError(message="Dify 返回缺少运行 ID", service_name="dify")
        return self._parse_workflow_run(data, fallback_status="running")

    async def get_workflow_run(self, *, run_id: str) -> DifyWorkflowRun:
        payload = await self._request("GET", f"/workflows/run/{run_id}")
        data = payload.get("data") or payload
        return self._parse_workflow_run(data, fallback_status="running")

    async def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        if not self.is_configured():
            raise ServiceUnavailableError(message="Dify 未配置", service_name="dify")
        headers = kwargs.pop("headers", {})
        headers["Authorization"] = f"Bearer {self.api_key}"
        headers["Content-Type"] = "application/json"
        try:
            response = await self.http_client.request(method, f"{self.base_url}{path}", headers=headers, **kwargs)
        except httpx.TimeoutException as exc:
            raise ServiceUnavailableError(message="请求 Dify 超时", service_name="dify") from exc
        except httpx.HTTPError as exc:
            raise ServiceUnavailableError(message="请求 Dify 失败", service_name="dify") from exc

        try:
            payload = response.json()
        except ValueError as exc:
            raise ServiceUnavailableError(message="Dify 返回了无效 JSON", service_name="dify") from exc

        if response.status_code >= 500:
            raise ServiceUnavailableError(message="Dify 服务暂时不可用", service_name="dify")
        if response.status_code >= 400:
            message = (
                payload.get("message")
                or payload.get("error")
                or payload.get("code")
                or "Dify 请求失败"
            )
            raise ValidationError(message=f"Dify 请求失败: {message}", field_errors={"dify": str(message)})
        return payload

    def _parse_workflow_run(self, data: dict[str, Any], *, fallback_status: str) -> DifyWorkflowRun:
        status = (data.get("status") or data.get("workflow_run", {}).get("status") or fallback_status).lower()
        outputs = data.get("outputs") or data.get("workflow_run", {}).get("outputs") or {}
        return DifyWorkflowRun(
            run_id=data.get("id") or data.get("workflow_run_id") or "",
            workflow_run_id=data.get("workflow_run_id"),
            workflow_id=data.get("workflow_id"),
            status=status,
            outputs=outputs if isinstance(outputs, dict) else {},
            raw_payload=data,
        )
