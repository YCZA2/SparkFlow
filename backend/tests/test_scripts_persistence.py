"""脚本持久化服务测试。"""

from __future__ import annotations

import pytest

from core.exceptions import ValidationError
from domains.pipelines import repository as pipeline_repository
from domains.scripts import repository as script_repository
from modules.auth.application import TEST_USER_ID
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
    """重复持久化同一 run 时应复用已创建脚本。"""
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
            input_payload={"topic": "测试主题", "fragment_ids": [], "mode": "mode_rag"},
            parsed_result={"title": "标题", "draft": "正文"},
        )
        refreshed_run = pipeline_repository.get_by_id(db=db, user_id=TEST_USER_ID, run_id=run.id)
        script_count = script_repository.count_by_user(db=db, user_id=TEST_USER_ID)

    assert first["script_id"] == second["script_id"]
    assert script_count == 1
    assert refreshed_run is not None
    assert refreshed_run.resource_type == "script"
    assert refreshed_run.resource_id == first["script_id"]
