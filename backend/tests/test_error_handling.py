"""统一错误处理回归测试。"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from modules.knowledge.application import KnowledgeUseCase
from tests.support import FakeVectorStore


class _ProbeRequest(BaseModel):
    """用于触发 FastAPI 请求体校验错误的探针请求。"""

    title: str


class _FailingKnowledgeStore(FakeVectorStore):
    """模拟知识索引写入失败，验证应用层会记录结构化日志。"""

    async def index_document(self, **kwargs):
        """固定抛出索引失败。"""
        raise RuntimeError("index boom")


class _StubLogger:
    """收集结构化日志调用，避免测试依赖真实文件 handler。"""

    def __init__(self) -> None:
        self.warning_calls: list[tuple[str, dict]] = []

    def warning(self, event: str, **fields) -> None:
        """记录 warning 事件和字段。"""
        self.warning_calls.append((event, fields))


@pytest.mark.asyncio
async def test_request_validation_errors_use_standard_error_shape(stateless_app, stateless_client) -> None:
    """框架级请求校验错误也应返回统一 error envelope。"""

    @stateless_app.post("/_tests/error-handling/request-validation")
    async def validation_probe(_: _ProbeRequest):
        """测试专用路由，实际不会执行成功分支。"""
        return {"ok": True}

    response = await stateless_client.post("/_tests/error-handling/request-validation", json={})
    payload = response.json()

    assert response.status_code == 422
    assert payload["success"] is False
    assert payload["data"] is None
    assert payload["message"] is None
    assert payload["error"]["code"] == "VALIDATION"
    assert "title" in payload["error"]["details"]


@pytest.mark.asyncio
async def test_http_exceptions_use_standard_error_shape(stateless_app, stateless_client) -> None:
    """显式 HTTPException 不应绕过统一错误响应结构。"""

    @stateless_app.get("/_tests/error-handling/http-exception")
    async def http_exception_probe():
        """测试专用路由，抛出带业务 code 的 HTTPException。"""
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CONFLICT",
                "message": "测试冲突",
                "details": {"resource": "probe"},
            },
        )

    response = await stateless_client.get("/_tests/error-handling/http-exception")
    payload = response.json()

    assert response.status_code == 409
    assert payload == {
        "success": False,
        "data": None,
        "message": None,
        "error": {
            "code": "CONFLICT",
            "message": "测试冲突",
            "details": {"resource": "probe"},
        },
    }


@pytest.mark.integration
@pytest.mark.asyncio
async def test_retry_missing_task_uses_not_found_error(async_client, auth_headers_factory) -> None:
    """任务重试找不到记录时应返回统一 404，而不是裸 RuntimeError 500。"""
    response = await async_client.post(
        "/api/tasks/missing-task/retry",
        json={},
        headers=await auth_headers_factory(async_client),
    )
    payload = response.json()

    assert response.status_code == 404
    assert payload["message"] is None
    assert payload["error"]["code"] == "NOT_FOUND"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_invalid_export_content_type_uses_validation_error(async_client, auth_headers_factory) -> None:
    """不支持的导出类型应返回统一校验错误体，而不是空 404。"""
    response = await async_client.get(
        "/api/exports/markdown/unknown/item-1",
        headers=await auth_headers_factory(async_client),
    )
    payload = response.json()

    assert response.status_code == 422
    assert payload["message"] is None
    assert payload["error"]["code"] == "VALIDATION"
    assert "content_type" in payload["error"]["details"]


@pytest.mark.integration
@pytest.mark.asyncio
async def test_knowledge_index_failure_is_logged(db_session_factory, monkeypatch) -> None:
    """知识索引失败被降级为文档状态时，也应保留服务端排障日志。"""
    stub_logger = _StubLogger()
    monkeypatch.setattr("modules.knowledge.application.logger", stub_logger)
    use_case = KnowledgeUseCase(knowledge_index_store=_FailingKnowledgeStore())

    with db_session_factory() as db:
        doc = await use_case.create_doc(
            db=db,
            user_id="test-user-001",
            title="失败索引文档",
            body_markdown="这是一段足够生成知识分块的正文。",
            doc_type="high_likes",
        )

    assert doc.processing_status == "failed"
    assert stub_logger.warning_calls
    assert stub_logger.warning_calls[0][0] == "knowledge_indexing_failed"
    assert stub_logger.warning_calls[0][1]["user_id"] == "test-user-001"
