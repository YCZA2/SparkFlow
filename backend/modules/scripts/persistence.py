from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from core.exceptions import ValidationError
from domains.pipelines import repository as pipeline_repository
from domains.scripts import repository as script_repository
from models import PipelineRun


class ScriptGenerationPersistenceService:
    """封装脚本生成结果解析与持久化。"""

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
        run: PipelineRun,
        input_payload: dict[str, Any],
        parsed_result: dict[str, Any],
    ) -> dict[str, Any]:
        """在 workflow 成功后回流创建脚本记录。"""
        draft = (parsed_result.get("draft") or "").strip()
        if not draft:
            raise ValidationError(message="工作流输出缺少 draft，无法创建口播稿", field_errors={"generation": "工作流执行失败"})
        existing = script_repository.get_by_id(db=db, user_id=run.user_id, script_id=run.resource_id or "")
        if existing:
            return {"script_id": existing.id, "result": parsed_result}
        script = script_repository.create(
            db=db,
            user_id=run.user_id,
            body_markdown=draft,
            mode=input_payload["mode"],
            source_fragment_ids=json.dumps(input_payload["fragment_ids"], ensure_ascii=False),
            title=parsed_result.get("title"),
        )
        run_output = self.build_run_output(
            script_id=script.id,
            parsed_result=parsed_result,
            mode=input_payload["mode"],
        )
        pipeline_repository.update_run_resource(
            db=db,
            run_id=run.id,
            resource_type="script",
            resource_id=script.id,
            output_payload=run_output,
        )
        return run_output

    @staticmethod
    def build_run_output(*, script_id: str, parsed_result: dict[str, Any], mode: str) -> dict[str, Any]:
        """构造统一的流水线输出载荷。"""
        return {
            "script_id": script_id,
            "result": parsed_result,
            "mode": mode,
        }

    def build_finalize_payload(self, *, script_id: str, parsed_result: dict[str, Any], mode: str) -> dict[str, Any]:
        """构造结束流水线所需的最终返回。"""
        return {
            "resource_type": "script",
            "resource_id": script_id,
            "run_output": self.build_run_output(script_id=script_id, parsed_result=parsed_result, mode=mode),
        }
