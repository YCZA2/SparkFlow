"""文档导入任务步骤执行器。"""

from __future__ import annotations

from typing import Any

from core.logging_config import get_logger
from modules.shared.content.document_parsers import parse_uploaded_text
from modules.shared.content.body_service import (
    convert_markdown_to_basic_html,
    extract_plain_text_from_html,
)
from modules.shared.fragment_snapshots import FragmentSnapshotReader
from modules.shared.tasks.task_types import (
    TaskExecutionContext,
    TaskExecutionError,
    TaskStepDefinition,
)
from modules.shared.media.stored_file_payloads import stored_file_from_payload
from modules.fragments.derivative_task import (
    TASK_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
)

logger = get_logger(__name__)

TASK_TYPE_DOCUMENT_IMPORT = "document_import"
_FRAGMENT_SNAPSHOT_READER = FragmentSnapshotReader()


class DocumentImportStepExecutor:
    """封装文档导入任务的步骤执行逻辑。"""

    def build_task_definitions(self) -> list[TaskStepDefinition]:
        """返回文档导入任务固定步骤定义。"""
        return [
            TaskStepDefinition(
                step_name="parse_document", executor=self.parse_document, max_attempts=2
            ),
            TaskStepDefinition(
                step_name="write_fragment_body",
                executor=self.write_fragment_body,
                max_attempts=1,
            ),
            TaskStepDefinition(
                step_name="finalize_import",
                executor=self.finalize_import,
                max_attempts=1,
            ),
        ]

    async def parse_document(self, context: TaskExecutionContext) -> dict[str, Any]:
        """从对象存储取回文件并解析为纯文本。"""
        payload = context.input_payload
        document_file_payload = payload.get("document_file")
        if not document_file_payload:
            raise TaskExecutionError("缺少文档文件元数据", retryable=False)
        stored_file = stored_file_from_payload(document_file_payload)
        if stored_file is None:
            raise TaskExecutionError("文档文件元数据无效", retryable=False)
        file_storage = context.container.file_storage
        try:
            file_content = file_storage.read_bytes(stored_file)
        except Exception as exc:
            raise TaskExecutionError(
                f"文档文件读取失败: {str(exc) or 'unknown error'}", retryable=True
            ) from exc
        source_filename = str(payload.get("source_filename") or "")
        try:
            plain_text = parse_uploaded_text(
                file_content=file_content, filename=source_filename
            )
        except Exception as exc:
            from core.exceptions import ValidationError

            if isinstance(exc, ValidationError):
                raise TaskExecutionError(str(exc), retryable=False) from exc
            raise TaskExecutionError(
                f"文档解析失败: {str(exc) or 'unknown error'}", retryable=False
            ) from exc
        return {"plain_text": plain_text}

    async def write_fragment_body(
        self, context: TaskExecutionContext
    ) -> dict[str, Any]:
        """将解析出的纯文本转为 HTML 写入 fragment snapshot。"""
        payload = context.input_payload
        parse_output = context.get_step_output("parse_document")
        plain_text = str(parse_output.get("plain_text") or "")
        if not plain_text:
            raise TaskExecutionError("文档解析结果为空", retryable=False)
        body_html = convert_markdown_to_basic_html(plain_text)
        plain_text_snapshot = extract_plain_text_from_html(body_html)
        fragment_id = str(
            payload.get("local_fragment_id") or payload.get("fragment_id") or ""
        ).strip()
        if not fragment_id:
            raise TaskExecutionError("缺少 fragment 标识", retryable=False)
        _FRAGMENT_SNAPSHOT_READER.merge_server_fields(
            db=context.db,
            user_id=context.run.user_id,
            fragment_id=fragment_id,
            source="document_import",
            server_patch={},
            snapshot_patch={
                "body_html": body_html,
                "plain_text_snapshot": plain_text_snapshot,
                "content_state": "body_present",
            },
        )
        return {
            "body_html": body_html,
            "plain_text_snapshot": plain_text_snapshot,
            "content_state": "body_present",
        }

    async def finalize_import(
        self, context: TaskExecutionContext
    ) -> dict[str, Any]:
        """触发衍生字段回填任务。"""
        payload = context.input_payload
        body_output = context.get_step_output("write_fragment_body")
        effective_text = str(body_output.get("plain_text_snapshot") or "").strip()
        fragment_id = str(payload.get("fragment_id") or "").strip()
        local_fragment_id = str(payload.get("local_fragment_id") or "").strip()
        logical_fragment_id = local_fragment_id or fragment_id
        if logical_fragment_id:
            task_runner = context.container.task_runner
            if task_runner is not None:
                try:
                    await task_runner.create_run(
                        run_id=None,
                        user_id=context.run.user_id,
                        task_type=TASK_TYPE_FRAGMENT_DERIVATIVE_BACKFILL,
                        input_payload={
                            "fragment_id": fragment_id or None,
                            "local_fragment_id": local_fragment_id or None,
                            "effective_text": effective_text,
                            "source": "document_import",
                            "audio_source": None,
                        },
                        resource_type="local_fragment"
                        if local_fragment_id
                        else "fragment",
                        resource_id=logical_fragment_id,
                    )
                except Exception as exc:
                    logger.warning(
                        "document_import_derivative_backfill_enqueue_failed",
                        fragment_id=logical_fragment_id,
                        user_id=context.run.user_id,
                        error=str(exc),
                    )
        return {
            "resource_type": "local_fragment" if local_fragment_id else "fragment",
            "resource_id": logical_fragment_id,
            "run_output": {
                "fragment_id": fragment_id or None,
                "local_fragment_id": local_fragment_id or None,
                "source": "document_import",
                "content_state": body_output.get("content_state"),
            },
        }
