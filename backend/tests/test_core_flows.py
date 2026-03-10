"""后端核心链路测试。"""

from __future__ import annotations

import asyncio
import io
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from core.exceptions import AppException, ValidationError
from domains.fragment_tags import repository as fragment_tag_repository
from models import Fragment, FragmentFolder, FragmentTag, KnowledgeDoc, User
from main import ensure_local_test_user
from modules.auth.application import TEST_USER_ID
from modules.shared.ports import ExternalMediaResolvedAudio


async def _auth_headers(async_client, auth_headers_factory) -> dict[str, str]:
    """生成带 Bearer Token 的请求头。"""
    return await auth_headers_factory(async_client)


async def _create_fragment(async_client, auth_headers_factory, payload: dict) -> dict:
    """通过 API 创建碎片并返回响应数据。"""
    response = await async_client.post("/api/fragments", json=payload, headers=await _auth_headers(async_client, auth_headers_factory))
    assert response.status_code == 201
    return response.json()["data"]


async def _create_folder(async_client, auth_headers_factory, name: str) -> str:
    """通过 API 创建文件夹并返回其 ID。"""
    response = await async_client.post(
        "/api/fragment-folders",
        json={"name": name},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 201
    return response.json()["data"]["id"]


async def _wait_pipeline(async_client, auth_headers_factory, run_id: str, *, attempts: int = 40) -> dict:
    """轮询后台流水线直到进入终态。"""
    headers = await _auth_headers(async_client, auth_headers_factory)
    for _ in range(attempts):
        response = await async_client.get(f"/api/pipelines/{run_id}", headers=headers)
        assert response.status_code == 200
        payload = response.json()["data"]
        if payload["status"] in {"succeeded", "failed"}:
            return payload
        await asyncio.sleep(0.05)
    raise AssertionError(f"pipeline {run_id} did not finish")


def _seed_fragment_tags(db_session_factory, fragment_id: str, tags: list[str]) -> None:
    """直接写库补齐标签聚合测试所需数据。"""
    with db_session_factory() as db:
        fragment = db.query(Fragment).filter(Fragment.id == fragment_id).first()
        assert fragment is not None
        fragment.tags = json.dumps(tags, ensure_ascii=False)
        fragment_tag_repository.replace_for_fragment(
            db=db,
            user_id=TEST_USER_ID,
            fragment_id=fragment_id,
            tags=tags,
        )
        db.commit()


def _seed_fragment_vector(app, fragment_id: str, transcript: str, *, source: str = "manual") -> None:
    """向内存向量库写入碎片 embedding 测试数据。"""
    app.state.container.vector_store.fragment_docs[fragment_id] = {
        "user_id": TEST_USER_ID,
        "fragment_id": fragment_id,
        "text": transcript,
        "source": source,
        "summary": None,
        "tags": [],
    }


@pytest.mark.asyncio
async def test_root_and_head_health_endpoints(async_client) -> None:
    """根路径和健康检查应返回成功状态与 request id。"""
    root_response = await async_client.get("/")
    assert root_response.status_code == 200
    assert root_response.json()["data"]["status"] == "ok"
    assert root_response.headers["X-Request-Id"]

    root_head_response = await async_client.head("/")
    assert root_head_response.status_code == 200
    assert root_head_response.text == ""

    health_head_response = await async_client.head("/health")
    assert health_head_response.status_code == 200
    assert health_head_response.text == ""


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("get", "/api/auth/me", None),
        ("post", "/api/auth/refresh", {}),
        ("get", "/api/fragments", None),
        ("post", "/api/scripts/daily-push/trigger", None),
        ("get", "/api/knowledge", None),
        ("post", "/api/external-media/audio-imports", {"share_url": "https://v.douyin.com/test", "platform": "auto"}),
    ],
)
async def test_protected_routes_require_authentication(async_client, method: str, path: str, payload) -> None:
    """未认证请求应统一返回鉴权错误。"""
    request = getattr(async_client, method)
    if payload is None:
        response = await request(path)
    else:
        response = await request(path, json=payload)
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION"


@pytest.mark.asyncio
async def test_auth_token_me_and_refresh(async_client, auth_headers_factory) -> None:
    """登录、获取当前用户和刷新令牌链路应正常工作。"""
    token_response = await async_client.post("/api/auth/token", json={})
    assert token_response.status_code == 200
    payload = token_response.json()["data"]
    assert payload["token_type"] == "bearer"

    headers = {"Authorization": f"Bearer {payload['access_token']}"}
    protected_response = await async_client.get("/api/auth/me", headers=headers)
    assert protected_response.status_code == 200
    assert protected_response.json()["data"]["user_id"] == TEST_USER_ID

    refresh_response = await async_client.post("/api/auth/refresh", headers=headers)
    assert refresh_response.status_code == 200
    refreshed = refresh_response.json()["data"]
    assert refreshed["token_type"] == "bearer"
    assert refreshed["access_token"]


@pytest.mark.asyncio
async def test_auth_token_recreates_missing_test_user(async_client, db_session_factory) -> None:
    """签发测试令牌时应自动补齐缺失的测试用户。"""
    with db_session_factory() as db:
        db.query(User).filter(User.id == TEST_USER_ID).delete()
        db.commit()

    token_response = await async_client.post("/api/auth/token", json={})
    assert token_response.status_code == 200

    with db_session_factory() as db:
        test_user = db.query(User).filter(User.id == TEST_USER_ID).first()
        assert test_user is not None
        assert test_user.nickname == "测试博主"
        assert test_user.role == "user"


def test_startup_hook_recreates_missing_test_user(db_session_factory, monkeypatch) -> None:
    """启动阶段应补齐测试用户，兼容旧 token 直接恢复场景。"""
    with db_session_factory() as db:
        db.query(User).filter(User.id == TEST_USER_ID).delete()
        db.commit()

    monkeypatch.setattr("main.SessionLocal", db_session_factory)
    ensure_local_test_user()

    with db_session_factory() as db:
        test_user = db.query(User).filter(User.id == TEST_USER_ID).first()
        assert test_user is not None
        assert test_user.nickname == "测试博主"


@pytest.mark.asyncio
async def test_fragments_collection_detail_similarity_and_visualization(async_client, auth_headers_factory, app) -> None:
    """碎片列表、详情、相似检索和可视化入口应返回一致数据。"""
    first_id = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "定位方法论的第一条碎片", "source": "manual"}))["id"]
    second_id = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "定位方法论的第二条碎片", "source": "manual"}))["id"]
    _seed_fragment_vector(app, first_id, "定位方法论的第一条碎片")
    _seed_fragment_vector(app, second_id, "定位方法论的第二条碎片")

    list_response = await async_client.get("/api/fragments", headers=await _auth_headers(async_client, auth_headers_factory))
    assert list_response.status_code == 200
    listed_ids = {item["id"] for item in list_response.json()["data"]["items"]}
    assert {first_id, second_id}.issubset(listed_ids)

    detail_response = await async_client.get(f"/api/fragments/{first_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert detail_response.status_code == 200
    assert detail_response.json()["data"]["id"] == first_id

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
async def test_create_fragment_rejects_invalid_source(async_client, auth_headers_factory) -> None:
    """非法 source 应走统一校验错误。"""
    response = await async_client.post(
        "/api/fragments",
        json={"transcript": "无效来源", "source": "unknown"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION"


@pytest.mark.asyncio
async def test_create_fragment_rejects_invalid_audio_source(async_client, auth_headers_factory) -> None:
    """非法 audio_source 应走统一校验错误。"""
    response = await async_client.post(
        "/api/fragments",
        json={"transcript": "无效音频来源", "source": "voice", "audio_source": "crawler"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION"


@pytest.mark.asyncio
async def test_import_external_audio_returns_saved_url(async_client, auth_headers_factory, app, external_media_provider, db_session_factory, tmp_path) -> None:
    """外部媒体导入成功后应通过流水线创建碎片并保存音频文件。"""
    temp_audio = tmp_path / "incoming.m4a"
    temp_audio.write_bytes(b"fake-m4a-audio")
    external_media_provider.next_result = ExternalMediaResolvedAudio(
        platform="douyin",
        share_url="https://v.douyin.com/demo",
        media_id="7614713222814088953",
        title="别说了 拿大力胶吧",
        author="老薯的薯",
        cover_url="https://example.com/cover.jpg",
        content_type="video",
        local_audio_path=str(temp_audio),
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
    assert "audio_public_url" not in payload
    assert "audio_relative_path" not in payload
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, payload["pipeline_run_id"])
    assert pipeline["status"] == "succeeded"
    assert pipeline["resource"]["resource_id"] == payload["fragment_id"]

    steps_response = await async_client.get(
        f"/api/pipelines/{payload['pipeline_run_id']}/steps",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    steps = {item["step_name"]: item for item in steps_response.json()["data"]["items"]}
    download_output = steps["download_media"]["output"]
    assert "audio/imported/" in download_output["audio_file"]["object_key"]
    assert download_output["audio_file_url"]
    assert not temp_audio.exists()

    with db_session_factory() as db:
        fragment = db.query(Fragment).filter(Fragment.id == payload["fragment_id"]).first()
        assert fragment is not None
        assert fragment.source == "voice"
        assert fragment.audio_source == "external_link"
        assert fragment.transcript == "转写完成"


@pytest.mark.asyncio
async def test_import_external_audio_rejects_invalid_link(async_client, auth_headers_factory, external_media_provider) -> None:
    """不支持的链接应在后台流水线里落到失败状态。"""
    external_media_provider.next_error = ValidationError(
        message="无法识别外部媒体链接",
        field_errors={"share_url": "当前仅支持抖音分享链接"},
    )
    response = await async_client.post(
        "/api/external-media/audio-imports",
        json={"share_url": "https://example.com/not-supported", "platform": "auto"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 200
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, response.json()["data"]["pipeline_run_id"])
    assert pipeline["status"] == "failed"
    assert "无法识别外部媒体链接" in (pipeline["error_message"] or "")


@pytest.mark.asyncio
async def test_import_external_audio_returns_error_when_provider_fails(async_client, auth_headers_factory, external_media_provider) -> None:
    """上游解析失败时应落到后台流水线失败状态。"""
    external_media_provider.next_error = AppException(message="抖音内容解析失败", code="EXTERNAL_MEDIA_IMPORT_FAILED", status_code=502)
    response = await async_client.post(
        "/api/external-media/audio-imports",
        json={"share_url": "https://v.douyin.com/demo", "platform": "douyin"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 200
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, response.json()["data"]["pipeline_run_id"])
    assert pipeline["status"] == "failed"
    assert "抖音内容解析失败" in (pipeline["error_message"] or "")


@pytest.mark.asyncio
async def test_fragment_folders_crud_filtering_and_moves(async_client, auth_headers_factory) -> None:
    """文件夹 CRUD、过滤与批量移动应保持一致行为。"""
    folder_a_id = await _create_folder(async_client, auth_headers_factory, "选题箱")
    folder_b_id = await _create_folder(async_client, auth_headers_factory, "待整理")

    list_folders_response = await async_client.get("/api/fragment-folders", headers=await _auth_headers(async_client, auth_headers_factory))
    folder_counts = {item["id"]: item["fragment_count"] for item in list_folders_response.json()["data"]["items"]}
    assert folder_counts[folder_a_id] == 0
    assert folder_counts[folder_b_id] == 0

    in_folder = await _create_fragment(async_client, auth_headers_factory, {"transcript": "放进文件夹的碎片", "source": "manual", "folder_id": folder_a_id})
    first_unfiled = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "未归类碎片 1", "source": "manual"}))["id"]
    second_unfiled = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "未归类碎片 2", "source": "manual"}))["id"]

    filtered_response = await async_client.get(f"/api/fragments?folder_id={folder_a_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert {item["id"] for item in filtered_response.json()["data"]["items"]} == {in_folder["id"]}

    move_response = await async_client.post(
        "/api/fragments/move",
        json={"fragment_ids": [first_unfiled, second_unfiled], "folder_id": folder_b_id},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert move_response.json()["data"]["moved_count"] == 2

    patch_response = await async_client.patch(
        f"/api/fragments/{first_unfiled}",
        json={"folder_id": None},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert patch_response.json()["data"]["folder_id"] is None

    rename_response = await async_client.patch(
        f"/api/fragment-folders/{folder_b_id}",
        json={"name": "已整理"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert rename_response.json()["data"]["name"] == "已整理"

    non_empty_delete = await async_client.delete(f"/api/fragment-folders/{folder_a_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert non_empty_delete.status_code == 409

    await async_client.patch(
        f"/api/fragments/{in_folder['id']}",
        json={"folder_id": None},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
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

    invalid_folder_fragment_response = await async_client.post(
        "/api/fragments",
        json={"transcript": "错误文件夹", "source": "manual", "folder_id": "missing-folder"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert invalid_folder_fragment_response.status_code == 404

    with db_session_factory() as db:
        assert db.query(FragmentFolder).filter(FragmentFolder.id == folder_id).first() is not None


@pytest.mark.asyncio
async def test_fragment_tags_listing_filtering_and_delete_consistency(async_client, auth_headers_factory, db_session_factory) -> None:
    """标签列表、筛选和删除后的聚合结果应保持一致。"""
    folder_id = await _create_folder(async_client, auth_headers_factory, "Tag 过滤")
    alpha_in_folder = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "alpha in folder", "source": "manual", "folder_id": folder_id}))["id"]
    alpha_free = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "alpha free", "source": "manual"}))["id"]
    beta_free = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "beta free", "source": "manual"}))["id"]
    zabc_fragment = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "zabc free", "source": "manual"}))["id"]
    cherry_fragment = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "cherry free", "source": "manual"}))["id"]

    _seed_fragment_tags(db_session_factory, alpha_in_folder, ["apple", "abc"])
    _seed_fragment_tags(db_session_factory, alpha_free, ["apple", "abd"])
    _seed_fragment_tags(db_session_factory, beta_free, ["banana", "banana"])
    _seed_fragment_tags(db_session_factory, zabc_fragment, ["zabc"])
    _seed_fragment_tags(db_session_factory, cherry_fragment, ["cherry"])

    popular_response = await async_client.get("/api/fragments/tags", headers=await _auth_headers(async_client, auth_headers_factory))
    assert [item["tag"] for item in popular_response.json()["data"]["items"][:5]] == ["apple", "abc", "abd", "banana", "cherry"]

    query_response = await async_client.get("/api/fragments/tags?query=ab", headers=await _auth_headers(async_client, auth_headers_factory))
    assert [item["tag"] for item in query_response.json()["data"]["items"]] == ["abc", "abd", "zabc"]

    tag_filter_response = await async_client.get("/api/fragments?tag=apple", headers=await _auth_headers(async_client, auth_headers_factory))
    assert {item["id"] for item in tag_filter_response.json()["data"]["items"]} == {alpha_in_folder, alpha_free}

    delete_response = await async_client.delete(f"/api/fragments/{zabc_fragment}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert delete_response.status_code == 200
    after_delete_response = await async_client.get("/api/fragments/tags?query=ab", headers=await _auth_headers(async_client, auth_headers_factory))
    assert [item["tag"] for item in after_delete_response.json()["data"]["items"]] == ["abc", "abd"]


@pytest.mark.asyncio
async def test_generate_script_success_and_failures(async_client, auth_headers_factory) -> None:
    """脚本生成应覆盖成功、缺失碎片和空内容失败分支。"""
    fragment_id = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "一条可用于生成稿件的碎片", "source": "manual"}))["id"]

    response = await async_client.post(
        "/api/scripts/generation",
        json={"fragment_ids": [fragment_id], "mode": "mode_a"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    script_data = response.json()["data"]
    assert response.status_code == 201
    assert script_data["pipeline_type"] == "script_generation"
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, script_data["pipeline_run_id"])
    assert pipeline["status"] == "succeeded"
    assert pipeline["output"]["script_id"]

    missing_fragment_response = await async_client.post(
        "/api/scripts/generation",
        json={"fragment_ids": ["missing-fragment"], "mode": "mode_a"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert missing_fragment_response.status_code == 404

    empty_fragment_id = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "", "source": "manual"}))["id"]
    empty_response = await async_client.post(
        "/api/scripts/generation",
        json={"fragment_ids": [empty_fragment_id], "mode": "mode_a"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert empty_response.status_code == 422


@pytest.mark.asyncio
async def test_generate_script_mode_b_uses_same_dify_flow(async_client, auth_headers_factory) -> None:
    """mode_b 应复用统一的 Dify 工作流并成功回流脚本。"""
    fragment_id = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "一条更自然表达的碎片", "source": "manual"}))["id"]

    response = await async_client.post(
        "/api/scripts/generation",
        json={"fragment_ids": [fragment_id], "mode": "mode_b"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 201
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, response.json()["data"]["pipeline_run_id"])
    assert pipeline["status"] == "succeeded"
    script_id = pipeline["output"]["script_id"]
    detail_response = await async_client.get(f"/api/scripts/{script_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert detail_response.json()["data"]["mode"] == "mode_b"


@pytest.mark.asyncio
async def test_generate_script_fails_when_workflow_output_has_no_draft(async_client, auth_headers_factory, app) -> None:
    """外挂工作流缺少 draft 时应按失败处理。"""
    fragment_id = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "一条缺稿测试碎片", "source": "manual"}))["id"]
    app.state.container.workflow_provider.next_draft = ""  # type: ignore[attr-defined]

    response = await async_client.post(
        "/api/scripts/generation",
        json={"fragment_ids": [fragment_id], "mode": "mode_a"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 201
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, response.json()["data"]["pipeline_run_id"])
    assert pipeline["status"] == "failed"


@pytest.mark.asyncio
async def test_get_daily_push_returns_not_found_when_missing(async_client, auth_headers_factory) -> None:
    """没有每日推盘脚本时应返回未找到。"""
    response = await async_client.get("/api/scripts/daily-push", headers=await _auth_headers(async_client, auth_headers_factory))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_scripts_list_detail_update_and_delete(async_client, auth_headers_factory) -> None:
    """脚本列表、详情、更新和删除应形成完整 CRUD。"""
    fragment_id = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "用于脚本列表和详情测试", "source": "manual"}))["id"]
    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"fragment_ids": [fragment_id], "mode": "mode_a"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, create_response.json()["data"]["pipeline_run_id"])
    script_id = pipeline["output"]["script_id"]

    list_response = await async_client.get("/api/scripts", headers=await _auth_headers(async_client, auth_headers_factory))
    assert script_id in {item["id"] for item in list_response.json()["data"]["items"]}

    detail_response = await async_client.get(f"/api/scripts/{script_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert detail_response.json()["data"]["id"] == script_id

    update_response = await async_client.patch(
        f"/api/scripts/{script_id}",
        json={"status": "ready", "title": "新的标题"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert update_response.json()["data"]["status"] == "ready"

    delete_response = await async_client.delete(f"/api/scripts/{script_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert delete_response.status_code == 200

    not_found_response = await async_client.get(f"/api/scripts/{script_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert not_found_response.status_code == 404


@pytest.mark.asyncio
async def test_update_script_rejects_invalid_status(async_client, auth_headers_factory) -> None:
    """非法脚本状态更新应被校验层拦截。"""
    fragment_id = (await _create_fragment(async_client, auth_headers_factory, {"transcript": "用于非法状态测试", "source": "manual"}))["id"]
    create_response = await async_client.post(
        "/api/scripts/generation",
        json={"fragment_ids": [fragment_id], "mode": "mode_a"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, create_response.json()["data"]["pipeline_run_id"])
    script_id = pipeline["output"]["script_id"]

    response = await async_client.patch(
        f"/api/scripts/{script_id}",
        json={"status": "published"},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION"


@pytest.mark.asyncio
async def test_upload_audio_transitions_to_synced_with_folder_and_tags(async_client, auth_headers_factory, db_session_factory) -> None:
    """上传音频后应通过后台流水线完成转写、摘要和标签写入。"""
    folder_id = await _create_folder(async_client, auth_headers_factory, "录音箱")
    response = await async_client.post(
        "/api/transcriptions",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
        data={"folder_id": folder_id},
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["pipeline_type"] == "media_ingestion"
    assert payload["audio_file_url"]
    assert "audio_path" not in payload
    assert "relative_path" not in payload
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, payload["pipeline_run_id"])
    assert pipeline["status"] == "succeeded"

    status_response = await async_client.get(
        f"/api/transcriptions/{payload['fragment_id']}",
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert status_response.status_code == 200
    assert status_response.json()["data"]["audio_source"] == "upload"

    with db_session_factory() as db:
        fragment = db.query(Fragment).filter(Fragment.id == payload["fragment_id"]).first()
        assert fragment is not None
        assert fragment.audio_source == "upload"
        assert fragment.transcript == "转写完成"
        assert fragment.folder_id == folder_id
        fragment_tags = db.query(FragmentTag).filter(FragmentTag.fragment_id == fragment.id).all()
        assert len(fragment_tags) >= 1
        assert payload["audio_file_url"]


@pytest.mark.asyncio
async def test_get_transcription_status_returns_not_found_for_missing_fragment(async_client, auth_headers_factory) -> None:
    """不存在的碎片不应返回转写状态。"""
    response = await async_client.get("/api/transcriptions/missing-fragment", headers=await _auth_headers(async_client, auth_headers_factory))
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_upload_audio_marks_failed_when_stt_crashes(async_client, auth_headers_factory, app, db_session_factory) -> None:
    """STT 异常时应让 pipeline 失败，并保留未完成碎片供排障。"""
    app.state.container.stt_provider = SimpleNamespace(
        transcribe=AsyncMock(side_effect=RuntimeError("stt boom")),
        health_check=AsyncMock(return_value=True),
    )
    response = await async_client.post(
        "/api/transcriptions",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
    )
    payload = response.json()["data"]
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, payload["pipeline_run_id"])
    assert pipeline["status"] == "failed"

    with db_session_factory() as db:
        fragment = db.query(Fragment).filter(Fragment.id == payload["fragment_id"]).first()
        assert fragment.audio_source == "upload"
        assert fragment.transcript is None


@pytest.mark.asyncio
async def test_upload_audio_uses_fallback_enrichment_when_llm_is_too_slow(async_client, auth_headers_factory, app, db_session_factory) -> None:
    """摘要超时时应使用本地 fallback 而不是整条链路失败。"""
    async def slow_generate(**kwargs):
        await asyncio.sleep(0.05)
        return "不会被用到"

    app.state.container.llm_provider = SimpleNamespace(generate=slow_generate, health_check=AsyncMock(return_value=True))

    with patch("modules.shared.audio_ingestion.ENRICHMENT_TIMEOUT_SECONDS", 0.01):
        response = await async_client.post(
            "/api/transcriptions",
            headers=await _auth_headers(async_client, auth_headers_factory),
            files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
        )
    payload = response.json()["data"]
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, payload["pipeline_run_id"])
    assert pipeline["status"] == "succeeded"

    with db_session_factory() as db:
        fragment = db.query(Fragment).filter(Fragment.id == payload["fragment_id"]).first()
        assert fragment is not None
        assert fragment.summary
        assert fragment.tags


@pytest.mark.asyncio
async def test_upload_audio_marks_failed_when_transcription_is_cancelled(async_client, auth_headers_factory, app, db_session_factory) -> None:
    """取消异常也应让 pipeline 进入失败终态。"""
    app.state.container.stt_provider = SimpleNamespace(
        transcribe=AsyncMock(side_effect=asyncio.CancelledError()),
        health_check=AsyncMock(return_value=True),
    )
    response = await async_client.post(
        "/api/transcriptions",
        headers=await _auth_headers(async_client, auth_headers_factory),
        files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
    )
    payload = response.json()["data"]
    pipeline = await _wait_pipeline(async_client, auth_headers_factory, payload["pipeline_run_id"])
    assert pipeline["status"] == "failed"

    with db_session_factory() as db:
        fragment = db.query(Fragment).filter(Fragment.id == payload["fragment_id"]).first()
        assert fragment is not None
        assert fragment.transcript is None


@pytest.mark.asyncio
async def test_delete_fragment_removes_audio_file(async_client, auth_headers_factory, app, db_session_factory, tmp_path) -> None:
    """删除带音频对象的碎片时应一并删除本地文件。"""
    upload_root = tmp_path.resolve()
    audio_file = upload_root / "audio" / "original" / TEST_USER_ID / "fragment-delete" / "delete-me.m4a"
    audio_file.parent.mkdir(parents=True, exist_ok=True)
    audio_file.write_bytes(b"fake-audio")

    with db_session_factory() as db:
        fragment = Fragment(
            user_id=TEST_USER_ID,
            transcript="待删除的碎片",
            source="voice",
            audio_source="upload",
            audio_storage_provider="local",
            audio_bucket="local",
            audio_object_key="audio/original/test-user-001/fragment-delete/delete-me.m4a",
            audio_access_level="private",
            audio_original_filename="delete-me.m4a",
            audio_mime_type="audio/m4a",
            audio_file_size=len(b"fake-audio"),
            audio_checksum=None,
        )
        db.add(fragment)
        db.commit()
        db.refresh(fragment)
        fragment_id = fragment.id

    response = await async_client.delete(f"/api/fragments/{fragment_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert response.status_code == 200
    assert not audio_file.exists()


@pytest.mark.asyncio
async def test_scripts_daily_push_trigger_get_force_trigger_and_idempotency(async_client, auth_headers_factory, app, db_session_factory) -> None:
    """每日推盘触发、读取和强制触发应保持幂等结果。"""
    fragment_ids = [
        (await _create_fragment(async_client, auth_headers_factory, {"transcript": f"同主题内容 {index}", "source": "manual"}))["id"]
        for index in range(3)
    ]
    with db_session_factory() as db:
        fragments = db.query(Fragment).filter(Fragment.id.in_(fragment_ids)).all()
        for fragment in fragments:
            _seed_fragment_vector(app, fragment.id, fragment.transcript, source=fragment.source)
        db.commit()

    first_response = await async_client.post("/api/scripts/daily-push/trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    daily_push_id = first_response.json()["data"]["id"]
    get_response = await async_client.get("/api/scripts/daily-push", headers=await _auth_headers(async_client, auth_headers_factory))
    assert get_response.json()["data"]["id"] == daily_push_id

    second_response = await async_client.post("/api/scripts/daily-push/trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    force_response = await async_client.post("/api/scripts/daily-push/force-trigger", headers=await _auth_headers(async_client, auth_headers_factory))
    assert second_response.json()["data"]["id"] == daily_push_id
    assert force_response.json()["data"]["id"] == daily_push_id


@pytest.mark.asyncio
async def test_knowledge_doc_create_upload_list_get_search_and_delete(async_client, auth_headers_factory, db_session_factory) -> None:
    """知识库文档应支持创建、上传、查询和删除。"""
    create_response = await async_client.post(
        "/api/knowledge",
        json={"title": "高赞案例", "content": "定位方法论与爆款选题", "doc_type": "high_likes"},
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

    detail_response = await async_client.get(f"/api/knowledge/{doc_id}", headers=await _auth_headers(async_client, auth_headers_factory))
    assert detail_response.json()["data"]["id"] == doc_id

    search_response = await async_client.post(
        "/api/knowledge/search",
        json={"query_text": "定位方法论", "top_k": 5},
        headers=await _auth_headers(async_client, auth_headers_factory),
    )
    assert search_response.json()["data"]["items"][0]["id"] == doc_id

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


@pytest.mark.asyncio
async def test_dependency_wiring_smoke(async_client) -> None:
    """健康检查应暴露关键 provider 的可用状态。"""
    response = await async_client.get("/health")
    payload = response.json()["data"]
    assert response.status_code == 200
    assert payload["status"] == "ok"
    assert payload["services"]["llm"] == "available"
    assert payload["services"]["stt"] == "available"
    assert payload["services"]["vector_db"] == "available"
