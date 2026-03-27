"""碎片链路集成测试（相似检索、外链导入、文件夹、标签）。"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from core.exceptions import ValidationError
from domains.fragments import repository as fragment_repository
from models import Fragment, FragmentFolder, FragmentTag
from modules.auth.application import TEST_USER_ID
from modules.shared.ports import ExternalMediaResolvedAudio

from tests.flow_helpers import (
    _auth_headers,
    _backup_fragment,
    _create_folder,
    _create_fragment,
    _editor_document,
    _seed_fragment_tags,
    _seed_fragment_vector,
    _wait_fragment_derivatives,
    _wait_pipeline,
)

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_fragments_similarity_and_visualization(async_client, auth_headers_factory, app, db_session_factory) -> None:
    """碎片相似检索和可视化入口应返回一致数据。"""
    first_fragment = await _create_fragment(
        db_session_factory,
        {"editor_document": _editor_document("定位方法论的第一条碎片"), "source": "manual"},
    )
    second_fragment = await _create_fragment(
        db_session_factory,
        {"editor_document": _editor_document("定位方法论的第二条碎片"), "source": "manual"},
    )
    await _backup_fragment(async_client, auth_headers_factory, first_fragment)
    await _backup_fragment(async_client, auth_headers_factory, second_fragment)
    first_id = first_fragment["id"]
    second_id = second_fragment["id"]
    _seed_fragment_vector(app, first_id, "定位方法论的第一条碎片")
    _seed_fragment_vector(app, second_id, "定位方法论的第二条碎片")

    similar_response = await async_client.post(
        "/api/fragments/similar",
        json={"query_text": "定位方法论", "top_k": 5, "exclude_ids": [first_id]},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert similar_response.status_code == 200
    assert similar_response.json()["data"]["items"][0]["id"] == second_id

    visualization_payload = {
        "points": [
            {
                "id": first_id,
                "x": 0.1,
                "y": 0.2,
                "z": 0.3,
                "transcript": "定位方法论的第一条碎片",
                "summary": None,
                "tags": ["定位"],
                "source": "manual",
                "created_at": "2026-03-07T00:00:00+08:00",
                "cluster_id": 1,
                "is_noise": False,
            }
        ],
        "clusters": [{"id": 1, "label": "定位", "keywords": ["定位", "方法论"], "fragment_count": 1, "centroid": {"x": 0.1, "y": 0.2, "z": 0.3}}],
        "stats": {"total_fragments": 1, "clustered_fragments": 1, "uncategorized_fragments": 0},
        "meta": {"projection": "pca", "clustering": "kmeans", "used_vector_source": "fake"},
    }
    with patch("modules.fragments.application.build_fragment_visualization", new=AsyncMock(return_value=visualization_payload)):
        visualization_response = await async_client.get("/api/fragments/visualization", headers=await _auth_headers(async_client, auth_headers_factory))
    assert visualization_response.status_code == 200
    assert visualization_response.json()["data"]["points"][0]["id"] == first_id


@pytest.mark.asyncio
async def test_import_external_audio_only_creates_pipeline_in_request_phase(async_client, auth_headers_factory, app, external_media_provider, db_session_factory) -> None:
    """外链导入请求阶段只创建任务，不同步解析媒体。"""
    await app.state.container.pipeline_dispatcher.stop()
    app.state.container.pipeline_runner.dispatcher.wake_up = lambda: None

    response = await async_client.post(
        "/api/external-media/audio-imports",
        json={"share_url": "https://v.douyin.com/demo", "platform": "auto"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload == {
        "pipeline_run_id": payload["pipeline_run_id"],
        "pipeline_type": "media_ingestion",
        "fragment_id": payload["fragment_id"],
        "local_fragment_id": None,
        "source": "voice",
        "audio_source": "external_link",
    }
    assert external_media_provider.calls == []

    with db_session_factory() as db:
        fragment = db.query(Fragment).filter(Fragment.id == payload["fragment_id"]).first()
        assert fragment is not None
        assert fragment.source == "voice"
        assert fragment.audio_source == "external_link"
        assert fragment.transcript is None


@pytest.mark.asyncio
async def test_import_external_audio_assigns_fragment_to_requested_folder(
    async_client,
    auth_headers_factory,
    app,
    external_media_provider,
    db_session_factory,
) -> None:
    """外链导入在请求阶段应把预创建 fragment 放入指定文件夹。"""
    await app.state.container.pipeline_dispatcher.stop()
    app.state.container.pipeline_runner.dispatcher.wake_up = lambda: None
    folder_id = await _create_folder(async_client, auth_headers_factory, "抖音导入")

    response = await async_client.post(
        "/api/external-media/audio-imports",
        json={
            "share_url": "https://v.douyin.com/demo",
            "platform": "auto",
            "folder_id": folder_id,
        },
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["fragment_id"]
    assert external_media_provider.calls == []

    with db_session_factory() as db:
        fragment = db.query(Fragment).filter(Fragment.id == payload["fragment_id"]).first()
        assert fragment is not None
        assert fragment.folder_id == folder_id


@pytest.mark.asyncio
async def test_import_external_audio_runs_full_async_pipeline(
    async_client,
    auth_headers_factory,
    external_media_provider,
    db_session_factory,
    tmp_path,
    vector_store,
) -> None:
    """外部媒体导入成功后应由后台流水线完成解析、下载和转写。"""
    temp_audio = tmp_path / "incoming.m4a"
    temp_audio.write_bytes(b"fake-m4a-audio")
    external_media_provider.queue_success(
        ExternalMediaResolvedAudio(
            platform="douyin",
            share_url="https://v.douyin.com/demo",
            media_id="7614713222814088953",
            title="别说了 拿大力胶吧",
            author="老薯的薯",
            cover_url="https://example.com/cover.jpg",
            content_type="video",
            local_audio_path=str(temp_audio),
        )
    )

    response = await async_client.post(
        "/api/external-media/audio-imports",
        json={"share_url": "https://v.douyin.com/demo", "platform": "auto"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["pipeline_type"] == "media_ingestion"
    assert payload["source"] == "voice"
    assert payload["audio_source"] == "external_link"
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, payload["pipeline_run_id"], attempts=140)
    assert pipeline["status"] == "succeeded"
    assert pipeline["resource"]["resource_id"] == payload["fragment_id"]
    assert pipeline["output"]["platform"] == "douyin"
    assert pipeline["output"]["media_id"] == "7614713222814088953"
    assert pipeline["output"]["title"] == "别说了 拿大力胶吧"
    assert pipeline["output"]["author"] == "老薯的薯"
    assert pipeline["output"]["cover_url"] == "https://example.com/cover.jpg"
    assert pipeline["output"]["content_type"] == "video"
    assert pipeline["output"]["audio_file_url"]
    assert pipeline["output"]["summary"] is None
    assert pipeline["output"]["tags"] == []

    steps_response = await async_client.get(
        f"/api/pipelines/{payload['pipeline_run_id']}/steps",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    steps = {item["step_name"]: item for item in steps_response.json()["data"]["items"]}
    assert steps["resolve_external_media"]["status"] == "succeeded"
    download_output = steps["download_media"]["output"]
    assert "audio/imported/" in download_output["audio_file"]["object_key"]
    assert download_output["audio_file_url"]
    assert not temp_audio.exists()

    enriched = await _wait_fragment_derivatives(db_session_factory, payload["fragment_id"])
    assert enriched.summary
    assert enriched.tags not in (None, "[]")

    with db_session_factory() as db:
        fragment = db.query(Fragment).filter(Fragment.id == payload["fragment_id"]).first()
        assert fragment is not None
        assert fragment.source == "voice"
        assert fragment.audio_source == "external_link"
        assert fragment.transcript == "转写完成"
    assert vector_store.fragment_docs[payload["fragment_id"]]["text"] == "转写完成"


@pytest.mark.asyncio
async def test_import_external_audio_marks_pipeline_failed_for_invalid_link(async_client, auth_headers_factory, external_media_provider) -> None:
    """不支持的链接应在后台步骤里失败且不触发重试。"""
    external_media_provider.queue_error(
        ValidationError(
            message="无法识别外部媒体链接",
            field_errors={"share_url": "当前仅支持抖音分享链接"},
        )
    )
    response = await async_client.post(
        "/api/external-media/audio-imports",
        json={"share_url": "https://example.com/not-supported", "platform": "auto"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 200
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, response.json()["data"]["pipeline_run_id"])
    assert pipeline["status"] == "failed"
    assert pipeline["error_message"] == "无法识别外部媒体链接"

    steps_response = await async_client.get(
        f"/api/pipelines/{response.json()['data']['pipeline_run_id']}/steps",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    steps = {item["step_name"]: item for item in steps_response.json()["data"]["items"]}
    assert steps["resolve_external_media"]["status"] == "failed"
    assert steps["resolve_external_media"]["attempt_count"] == 1


@pytest.mark.asyncio
async def test_import_external_audio_retries_when_provider_temporarily_fails(async_client, auth_headers_factory, app, tmp_path) -> None:
    """上游解析临时失败后应自动重试并恢复成功。"""
    temp_audio = tmp_path / "retry-success.m4a"
    temp_audio.write_bytes(b"fake-m4a-audio")
    resolved = ExternalMediaResolvedAudio(
        platform="douyin",
        share_url="https://v.douyin.com/demo",
        media_id="7614713222814088954",
        title="重试成功",
        author="测试作者",
        cover_url="https://example.com/retry.jpg",
        content_type="video",
        local_audio_path=str(temp_audio),
    )
    app.state.container.external_media_provider = SimpleNamespace(
        resolve_audio=AsyncMock(side_effect=[RuntimeError("temporary parse error"), resolved]),
        health_check=AsyncMock(return_value=True),
    )
    response = await async_client.post(
        "/api/external-media/audio-imports",
        json={"share_url": "https://v.douyin.com/demo", "platform": "douyin"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 200
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, response.json()["data"]["pipeline_run_id"])
    assert pipeline["status"] == "succeeded"
    assert pipeline["output"]["media_id"] == "7614713222814088954"

    steps_response = await async_client.get(
        f"/api/pipelines/{response.json()['data']['pipeline_run_id']}/steps",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    steps = {item["step_name"]: item for item in steps_response.json()["data"]["items"]}
    assert steps["resolve_external_media"]["status"] == "succeeded"
    assert steps["resolve_external_media"]["attempt_count"] == 2


@pytest.mark.asyncio
async def test_fragment_folders_crud_filtering_and_moves(async_client, auth_headers_factory, db_session_factory) -> None:
    """文件夹 CRUD、计数更新与批量移动应保持一致行为。"""
    folder_a_id = await _create_folder(async_client, auth_headers_factory, "选题箱")
    folder_b_id = await _create_folder(async_client, auth_headers_factory, "待整理")

    list_folders_response = await async_client.get("/api/fragment-folders", headers=await _auth_headers(async_client, auth_headers_factory))
    folder_counts = {item["id"]: item["fragment_count"] for item in list_folders_response.json()["data"]["items"]}
    assert folder_counts[folder_a_id] == 0
    assert folder_counts[folder_b_id] == 0

    in_folder = await _create_fragment(db_session_factory, {"editor_document": _editor_document("放进文件夹的碎片"), "source": "manual", "folder_id": folder_a_id})
    first_unfiled = (await _create_fragment(db_session_factory, {"editor_document": _editor_document("未归类碎片 1"), "source": "manual"}))["id"]
    second_unfiled = (await _create_fragment(db_session_factory, {"editor_document": _editor_document("未归类碎片 2"), "source": "manual"}))["id"]

    with db_session_factory() as db:
        in_folder_fragment = fragment_repository.get_by_id(db=db, user_id=TEST_USER_ID, fragment_id=in_folder["id"])
        first_fragment = fragment_repository.get_by_id(db=db, user_id=TEST_USER_ID, fragment_id=first_unfiled)
        second_fragment = fragment_repository.get_by_id(db=db, user_id=TEST_USER_ID, fragment_id=second_unfiled)
        assert in_folder_fragment is not None and first_fragment is not None and second_fragment is not None
        assert in_folder_fragment.folder_id == folder_a_id
        fragment_repository.move_by_ids(db=db, fragments=[first_fragment, second_fragment], folder_id=folder_b_id)
        fragment_repository.update_folder(db=db, fragment=first_fragment, folder_id=None)

    rename_response = await async_client.patch(
        f"/api/fragment-folders/{folder_b_id}",
        json={"name": "已整理"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert rename_response.json()["data"]["name"] == "已整理"

    non_empty_delete = await async_client.delete(f"/api/fragment-folders/{folder_a_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert non_empty_delete.status_code == 409

    with db_session_factory() as db:
        in_folder_fragment = fragment_repository.get_by_id(db=db, user_id=TEST_USER_ID, fragment_id=in_folder["id"])
        assert in_folder_fragment is not None
        fragment_repository.update_folder(db=db, fragment=in_folder_fragment, folder_id=None)
    empty_delete = await async_client.delete(f"/api/fragment-folders/{folder_a_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert empty_delete.status_code == 200
    assert empty_delete.json()["data"] is None


@pytest.mark.asyncio
async def test_fragment_folder_validation_and_conflicts(async_client, auth_headers_factory, db_session_factory) -> None:
    """文件夹重复、空名和缺失资源应返回明确错误。"""
    folder_id = await _create_folder(async_client, auth_headers_factory, "灵感仓")

    duplicate_response = await async_client.post(
        "/api/fragment-folders",
        json={"name": "灵感仓"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert duplicate_response.status_code == 409

    empty_name_response = await async_client.post(
        "/api/fragment-folders",
        json={"name": "   "},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert empty_name_response.status_code == 422

    second_folder_response = await async_client.post(
        "/api/fragment-folders",
        json={"name": "另一个文件夹"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    second_folder_id = second_folder_response.json()["data"]["id"]

    rename_response = await async_client.patch(
        f"/api/fragment-folders/{second_folder_id}",
        json={"name": "灵感仓"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert rename_response.status_code == 409

    with db_session_factory() as db:
        assert db.query(FragmentFolder).filter(FragmentFolder.id == folder_id).first() is not None


@pytest.mark.asyncio
async def test_fragment_tags_listing_filtering_and_delete_consistency(async_client, auth_headers_factory, db_session_factory) -> None:
    """标签列表和删除后的聚合结果应保持一致。"""
    folder_id = await _create_folder(async_client, auth_headers_factory, "Tag 过滤")
    alpha_in_folder = (await _create_fragment(db_session_factory, {"editor_document": _editor_document("alpha in folder"), "source": "manual", "folder_id": folder_id}))["id"]
    alpha_free = (await _create_fragment(db_session_factory, {"editor_document": _editor_document("alpha free"), "source": "manual"}))["id"]
    beta_free = (await _create_fragment(db_session_factory, {"editor_document": _editor_document("beta free"), "source": "manual"}))["id"]
    zabc_fragment = (await _create_fragment(db_session_factory, {"editor_document": _editor_document("zabc free"), "source": "manual"}))["id"]
    cherry_fragment = (await _create_fragment(db_session_factory, {"editor_document": _editor_document("cherry free"), "source": "manual"}))["id"]

    _seed_fragment_tags(db_session_factory, alpha_in_folder, ["apple", "abc"])
    _seed_fragment_tags(db_session_factory, alpha_free, ["apple", "abd"])
    _seed_fragment_tags(db_session_factory, beta_free, ["banana", "banana"])
    _seed_fragment_tags(db_session_factory, zabc_fragment, ["zabc"])
    _seed_fragment_tags(db_session_factory, cherry_fragment, ["cherry"])

    popular_response = await async_client.get("/api/fragments/tags", headers=await _auth_headers(async_client, auth_headers_factory))
    assert [item["tag"] for item in popular_response.json()["data"]["items"][:5]] == ["apple", "abc", "abd", "banana", "cherry"]

    query_response = await async_client.get("/api/fragments/tags?query=ab", headers=await _auth_headers(async_client, auth_headers_factory))
    assert [item["tag"] for item in query_response.json()["data"]["items"]] == ["abc", "abd", "zabc"]

    with db_session_factory() as db:
        alpha_folder_fragment = fragment_repository.get_by_id(db=db, user_id=TEST_USER_ID, fragment_id=alpha_in_folder)
        alpha_free_fragment = fragment_repository.get_by_id(db=db, user_id=TEST_USER_ID, fragment_id=alpha_free)
        fragment = fragment_repository.get_by_id(db=db, user_id=TEST_USER_ID, fragment_id=zabc_fragment)
        assert alpha_folder_fragment is not None and alpha_free_fragment is not None and fragment is not None
        assert json.loads(alpha_folder_fragment.tags) == ["apple", "abc"]
        assert json.loads(alpha_free_fragment.tags) == ["apple", "abd"]
        fragment_repository.delete(db=db, fragment=fragment)
    after_delete_response = await async_client.get("/api/fragments/tags?query=ab", headers=await _auth_headers(async_client, auth_headers_factory))
    assert [item["tag"] for item in after_delete_response.json()["data"]["items"]] == ["abc", "abd"]
