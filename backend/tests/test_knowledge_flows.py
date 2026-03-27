"""知识库链路集成测试。"""

from __future__ import annotations

import io

import pytest
from models import KnowledgeDoc

from tests.flow_helpers import _auth_headers

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_knowledge_doc_create_upload_list_get_search_and_delete(async_client, auth_headers_factory, db_session_factory) -> None:
    """知识库文档应支持创建、上传、查询和删除。"""
    create_response = await async_client.post(
        "/api/knowledge",
        json={"title": "高赞案例", "body_markdown": "定位方法论与爆款选题", "doc_type": "high_likes"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    doc_id = create_response.json()["data"]["id"]

    upload_response = await async_client.post(
        "/api/knowledge/upload",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"file": ("habit.txt", io.BytesIO("表达风格与语言习惯".encode("utf-8")), "text/plain")},
        data={"title": "语言习惯", "doc_type": "language_habit"},
    )
    uploaded_doc_id = upload_response.json()["data"]["id"]

    list_response = await async_client.get("/api/knowledge", headers=await _auth_headers(async_client, auth_headers_factory))
    listed_ids = {item["id"] for item in list_response.json()["data"]["items"]}
    assert {doc_id, uploaded_doc_id}.issubset(listed_ids)
    uploaded_doc = next(item for item in list_response.json()["data"]["items"] if item["id"] == uploaded_doc_id)
    assert uploaded_doc["source_type"] == "upload"
    assert uploaded_doc["source_filename"] == "habit.txt"
    assert uploaded_doc["chunk_count"] >= 1

    detail_response = await async_client.get(f"/api/knowledge/{doc_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert detail_response.json()["data"]["id"] == doc_id
    assert detail_response.json()["data"]["source_type"] == "manual"

    search_response = await async_client.post(
        "/api/knowledge/search",
        json={"query_text": "定位方法论", "top_k": 5},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert search_response.json()["data"]["items"][0]["id"] == doc_id
    assert search_response.json()["data"]["items"][0]["matched_chunks"]

    update_response = await async_client.patch(
        f"/api/knowledge/{doc_id}",
        json={"body_markdown": "新的爆款结构与强钩子"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert update_response.status_code == 200

    refreshed_search = await async_client.post(
        "/api/knowledge/search",
        json={"query_text": "强钩子", "top_k": 5},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert refreshed_search.status_code == 200
    assert refreshed_search.json()["data"]["items"][0]["id"] == doc_id

    delete_response = await async_client.delete(f"/api/knowledge/{uploaded_doc_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert delete_response.status_code == 200

    with db_session_factory() as db:
        doc = db.query(KnowledgeDoc).filter(KnowledgeDoc.id == doc_id).first()
        assert doc is not None
        assert doc.vector_ref_id
        deleted = db.query(KnowledgeDoc).filter(KnowledgeDoc.id == uploaded_doc_id).first()
        assert deleted is None


@pytest.mark.asyncio
async def test_knowledge_upload_rejects_invalid_file_and_search_validates_top_k(async_client, auth_headers_factory) -> None:
    """知识库上传和搜索参数应走统一校验。"""
    invalid_upload_response = await async_client.post(
        "/api/knowledge/upload",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"file": ("bad.pdf", io.BytesIO(b"%PDF"), "application/pdf")},
        data={"title": "坏文件", "doc_type": "high_likes"},
    )
    assert invalid_upload_response.status_code == 422

    empty_upload_response = await async_client.post(
        "/api/knowledge/upload",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"file": ("empty.txt", io.BytesIO(b"   "), "text/plain")},
        data={"title": "空文件", "doc_type": "high_likes"},
    )
    assert empty_upload_response.status_code == 422

    invalid_search_response = await async_client.post(
        "/api/knowledge/search",
        json={"query_text": "定位", "top_k": 0},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert invalid_search_response.status_code == 422
