"""脚本持久化服务测试。"""

from __future__ import annotations

from datetime import date

import pytest

from core.exceptions import ValidationError
from domains.pipelines import repository as pipeline_repository
from domains.scripts import repository as script_repository
from modules.auth.application import TEST_USER_ID
from modules.scripts.daily_push_pipeline import DailyPushPersistenceService
from modules.scripts.persistence import ScriptGenerationPersistenceService


def _create_script_run(db):
    """创建供脚本持久化测试使用的流水线。"""
    return pipeline_repository.create_run(
        db=db,
        run_id="script-run-001",
        user_id=TEST_USER_ID,
        pipeline_type="rag_script_generation",
        input_payload={"topic": "测试主题", "fragment_ids": [], "mode": "mode_rag"},
        resource_type=None,
        resource_id=None,
        steps=[],
    )


def _create_daily_push_run(db):
    """创建供每日推盘持久化测试使用的流水线。"""
    return pipeline_repository.create_run(
        db=db,
        run_id="daily-push-run-001",
        user_id=TEST_USER_ID,
        pipeline_type="daily_push_generation",
        input_payload={
            "fragment_ids": ["fragment-1"],
            "target_date": date.today().isoformat(),
            "title_prefix": "每日",
        },
        resource_type=None,
        resource_id=None,
        steps=[],
    )


def test_persistence_service_parse_outputs_normalizes_fields() -> None:
    """输出解析应只保留标准化字段。"""
    service = ScriptGenerationPersistenceService()

    parsed = service.parse_outputs(
        {
            "title": "标题",
            "outline": "提纲",
            "draft": "正文",
            "used_sources": ["a"],
            "review_notes": "备注",
            "model_metadata": {"provider": "fake"},
            "ignored": "value",
        }
    )

    assert parsed == {
        "title": "标题",
        "outline": "提纲",
        "draft": "正文",
        "used_sources": ["a"],
        "review_notes": "备注",
        "model_metadata": {"provider": "fake"},
    }


@pytest.mark.integration
def test_persistence_service_rejects_missing_draft(db_session_factory) -> None:
    """缺少 draft 时应拒绝落库脚本。"""
    service = ScriptGenerationPersistenceService()

    with db_session_factory() as db:
        run = _create_script_run(db)

        with pytest.raises(ValidationError) as exc_info:
            service.persist_script(
                db=db,
                run=run,
                input_payload={"topic": "测试主题", "fragment_ids": [], "mode": "mode_rag"},
                parsed_result={"title": "缺正文"},
            )

    assert "缺少 draft" in str(exc_info.value)


@pytest.mark.integration
def test_persistence_service_persists_script_idempotently(db_session_factory) -> None:
    """重复持久化同一 run 时应复用脚本并刷新为本次生成结果。"""
    service = ScriptGenerationPersistenceService()

    with db_session_factory() as db:
        run = _create_script_run(db)
        first = service.persist_script(
            db=db,
            run=run,
            input_payload={"topic": "测试主题", "fragment_ids": [], "mode": "mode_rag"},
            parsed_result={"title": "标题", "draft": "正文"},
        )
        db.refresh(run)
        second = service.persist_script(
            db=db,
            run=run,
            input_payload={"topic": "测试主题", "fragment_ids": ["fragment-1"], "mode": "mode_rag"},
            parsed_result={"title": "新标题", "draft": "新正文"},
        )
        refreshed_run = pipeline_repository.get_by_id(db=db, user_id=TEST_USER_ID, run_id=run.id)
        script_count = script_repository.count_by_user(db=db, user_id=TEST_USER_ID)
        persisted_script = script_repository.get_by_id(db=db, user_id=TEST_USER_ID, script_id=first["script_id"])

    assert first["script_id"] == second["script_id"]
    assert script_count == 1
    assert refreshed_run is not None
    assert refreshed_run.resource_type == "script"
    assert refreshed_run.resource_id == first["script_id"]
    assert persisted_script is not None
    assert persisted_script.title == "新标题"
    assert "新正文" in persisted_script.body_html
    assert persisted_script.source_fragment_ids == '["fragment-1"]'


@pytest.mark.integration
def test_persistence_service_rolls_back_script_when_run_binding_fails(db_session_factory, monkeypatch) -> None:
    """绑定 run 失败时不应留下半成功的 script 记录。"""
    service = ScriptGenerationPersistenceService()

    def _boom(*args, **kwargs):
        raise RuntimeError("bind run failed")

    monkeypatch.setattr(pipeline_repository, "update_run_resource", _boom)

    with db_session_factory() as db:
        run = _create_script_run(db)
        with pytest.raises(RuntimeError, match="bind run failed"):
            service.persist_script(
                db=db,
                run=run,
                input_payload={"topic": "测试主题", "fragment_ids": [], "mode": "mode_rag"},
                parsed_result={"title": "标题", "draft": "正文"},
            )
        db.expire_all()
        refreshed_run = pipeline_repository.get_by_id(db=db, user_id=TEST_USER_ID, run_id=run.id)
        script_count = script_repository.count_by_user(db=db, user_id=TEST_USER_ID)

    assert refreshed_run is not None
    assert refreshed_run.resource_id is None
    assert script_count == 0


@pytest.mark.integration
def test_daily_push_persistence_rolls_back_script_when_run_binding_fails(db_session_factory, monkeypatch) -> None:
    """每日推盘绑定 run 失败时不应留下半成功的 script 记录。"""
    service = DailyPushPersistenceService()

    def _boom(*args, **kwargs):
        raise RuntimeError("bind run failed")

    monkeypatch.setattr(pipeline_repository, "update_run_resource", _boom)

    with db_session_factory() as db:
        run = _create_daily_push_run(db)
        with pytest.raises(RuntimeError, match="bind run failed"):
            service.persist_script(
                db=db,
                run=run,
                input_payload={
                    "fragment_ids": ["fragment-1"],
                    "target_date": date.today().isoformat(),
                    "title_prefix": "每日",
                },
                draft="每日推盘正文",
                title="每日标题",
            )
        db.expire_all()
        refreshed_run = pipeline_repository.get_by_id(db=db, user_id=TEST_USER_ID, run_id=run.id)
        script_count = script_repository.count_by_user(db=db, user_id=TEST_USER_ID)

    assert refreshed_run is not None
    assert refreshed_run.resource_id is None
    assert script_count == 0
