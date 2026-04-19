from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from core.exceptions import ValidationError
from domains.tasks import repository as task_repository
from domains.scripts import repository as script_repository
from models import TaskRun
from modules.shared.content.content_html import convert_markdown_to_basic_html


class ScriptGenerationPersistenceService:
    """封装脚本生成结果解析与持久化。"""

    @staticmethod
    def build_provider_metadata(*, workflow_id: str | None, provider_run_id: str | None, provider_task_id: str | None) -> dict[str, str]:
        """构造任务结果中可复用的 provider 元数据。"""
        provider: dict[str, str] = {}
        if workflow_id:
            provider["workflow_id"] = workflow_id
        if provider_run_id:
            provider["provider_run_id"] = provider_run_id
        if provider_task_id:
            provider["provider_task_id"] = provider_task_id
        return provider

    def parse_outputs(self, outputs: dict[str, Any]) -> dict[str, Any]:
        """规范化外挂工作流输出字段。"""
        if not isinstance(outputs, dict):
            return {}
        return {
            "title": outputs.get("title"),
            "outline": outputs.get("outline"),
            "draft": outputs.get("draft"),
            "used_sources": outputs.get("used_sources") or [],
            "review_notes": outputs.get("review_notes"),
            "model_metadata": outputs.get("model_metadata"),
        }

    def resolve_failure_message(self, payload: dict[str, Any]) -> str:
        """提取 provider 失败时最可读的错误信息。"""
        return payload.get("error") or payload.get("message") or payload.get("status") or "外挂工作流执行失败"

    def persist_script(
        self,
        *,
        db: Session,
        run: TaskRun,
        input_payload: dict[str, Any],
        parsed_result: dict[str, Any],
        provider_metadata: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """在 workflow 成功后回流创建脚本记录。"""
        draft = (parsed_result.get("draft") or "").strip()
        if not draft:
            raise ValidationError(message="工作流输出缺少 draft，无法创建口播稿", field_errors={"generation": "工作流执行失败"})
        draft_html = convert_markdown_to_basic_html(draft)
        source_fragment_ids = json.dumps(
            input_payload.get("fragment_ids")
            or [item.get("id") for item in input_payload.get("fragment_snapshots") or []],
            ensure_ascii=False,
        )
        try:
            existing = script_repository.get_by_id(db=db, user_id=run.user_id, script_id=run.resource_id or "")
            if existing:
                script_repository.update(
                    db=db,
                    script=existing,
                    status_value=None,
                    title=parsed_result.get("title"),
                    body_html=draft_html,
                    source_fragment_ids=source_fragment_ids,
                    auto_commit=False,
                )
                run_output = self.build_run_output(
                    script_id=existing.id,
                    parsed_result=parsed_result,
                    mode=input_payload["mode"],
                    provider_metadata=provider_metadata,
                )
                if run.resource_type != "script" or run.resource_id != existing.id:
                    task_repository.update_run_resource(
                        db=db,
                        run_id=run.id,
                        resource_type="script",
                        resource_id=existing.id,
                        output_payload=run_output,
                        auto_commit=False,
                    )
                db.commit()
                db.refresh(existing)
                return run_output
            script = script_repository.create(
                db=db,
                user_id=run.user_id,
                body_html=draft_html,
                mode=input_payload["mode"],
                source_fragment_ids=source_fragment_ids,
                title=parsed_result.get("title"),
                auto_commit=False,
            )
            run_output = self.build_run_output(
                script_id=script.id,
                parsed_result=parsed_result,
                mode=input_payload["mode"],
                provider_metadata=provider_metadata,
            )
            task_repository.update_run_resource(
                db=db,
                run_id=run.id,
                resource_type="script",
                resource_id=script.id,
                output_payload=run_output,
                auto_commit=False,
            )
            db.commit()
            db.refresh(script)
            return run_output
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def build_run_output(
        *,
        script_id: str,
        parsed_result: dict[str, Any],
        mode: str,
        provider_metadata: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """构造统一的任务输出载荷。"""
        payload = {
            "script_id": script_id,
            "result": parsed_result,
            "mode": mode,
        }
        if provider_metadata:
            payload["provider"] = provider_metadata
        return payload

    def build_finalize_payload(
        self,
        *,
        script_id: str,
        parsed_result: dict[str, Any],
        mode: str,
        provider_metadata: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """构造结束任务所需的最终返回。"""
        return {
            "resource_type": "script",
            "resource_id": script_id,
            "run_output": self.build_run_output(
                script_id=script_id,
                parsed_result=parsed_result,
                mode=mode,
                provider_metadata=provider_metadata,
            ),
        }
