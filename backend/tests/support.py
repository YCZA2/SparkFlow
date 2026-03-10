"""测试辅助对象。"""

from __future__ import annotations

from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any

from modules.shared.ports import ExternalMediaResolvedAudio, WebSearchResult, WorkflowProviderRun, WorkflowRunStatus


class FakeVectorStore:
    """提供碎片与知识库向量操作的内存替身。"""

    def __init__(self) -> None:
        self.fragment_docs: dict[str, dict] = {}
        self.knowledge_docs: dict[str, dict] = {}
        self.knowledge_results: list[dict] = []

    async def upsert_fragment(self, *, user_id: str, fragment_id: str, text: str, source: str, summary, tags):
        self.fragment_docs[fragment_id] = {
            "user_id": user_id,
            "fragment_id": fragment_id,
            "text": text,
            "source": source,
            "summary": summary,
            "tags": tags or [],
        }
        return True

    async def delete_fragment(self, *, user_id: str, fragment_id: str):
        """删除内存中的碎片向量文档。"""
        self.fragment_docs.pop(fragment_id, None)
        return True

    async def query_fragments(self, *, user_id: str, query_text: str, top_k: int, exclude_ids=None):
        excluded = set(exclude_ids or [])
        items = [
            {
                "fragment_id": fragment_id,
                "score": 0.95 if query_text in payload["text"] else 0.8,
                "metadata": {"source": payload["source"]},
            }
            for fragment_id, payload in self.fragment_docs.items()
            if payload["user_id"] == user_id and fragment_id not in excluded
        ]
        return items[:top_k]

    async def list_fragment_documents(self, *, user_id: str, include_embeddings: bool = True):
        return []

    async def upsert_knowledge_doc(self, *, user_id: str, doc_id: str, title: str, content: str, doc_type: str):
        vector_ref_id = f"knowledge_{user_id}:{doc_id}"
        self.knowledge_docs[doc_id] = {
            "user_id": user_id,
            "title": title,
            "content": content,
            "doc_type": doc_type,
            "vector_ref_id": vector_ref_id,
        }
        return vector_ref_id

    async def query_knowledge_docs(self, *, user_id: str, query_text: str, top_k: int):
        if self.knowledge_results:
            return self.knowledge_results[:top_k]
        items = [
            {"doc_id": doc_id, "score": 0.9, "content": payload["content"], "metadata": {"title": payload["title"]}}
            for doc_id, payload in self.knowledge_docs.items()
            if payload["user_id"] == user_id and query_text in payload["content"]
        ]
        return items[:top_k]

    async def delete_knowledge_doc(self, *, user_id: str, doc_id: str):
        self.knowledge_docs.pop(doc_id, None)
        return True

    async def health_check(self):
        return True


class FakeExternalMediaProvider:
    """用于外部媒体导入接口的可编排 provider。"""

    def __init__(self) -> None:
        self.calls: list[dict[str, str]] = []
        self._queued_result: ExternalMediaResolvedAudio | None = None
        self._queued_error: Exception | None = None

    def queue_success(self, resolved_audio: ExternalMediaResolvedAudio) -> None:
        """显式编排下一次解析成功结果。"""
        self._queued_result = resolved_audio
        self._queued_error = None

    def queue_error(self, exc: Exception) -> None:
        """显式编排下一次解析抛出的异常。"""
        self._queued_error = exc
        self._queued_result = None

    async def resolve_audio(self, *, share_url: str, platform: str) -> ExternalMediaResolvedAudio:
        self.calls.append({"share_url": share_url, "platform": platform})
        if self._queued_error is not None:
            raise self._queued_error
        if self._queued_result is not None:
            return self._queued_result
        raise RuntimeError("fake external media provider not configured")

    async def health_check(self) -> bool:
        return True


class FakeWebSearchProvider:
    """记录查询词并返回固定结果的 Web 搜索替身。"""

    def __init__(self) -> None:
        self.calls: list[str] = []

    async def search(self, *, query_text: str, top_k: int):
        self.calls.append(query_text)
        return [WebSearchResult(title="A", url="https://example.com", snippet="snippet")][:top_k]


@dataclass
class WorkflowSubmitCall:
    """记录 workflow 提交调用。"""

    inputs: dict[str, Any]
    user_id: str


@dataclass
class WorkflowPollCall:
    """记录 workflow 轮询调用。"""

    run_id: str


@dataclass
class QueuedWorkflowOutcome:
    """描述下一次轮询应返回的 workflow 结果。"""

    status: WorkflowRunStatus
    outputs: dict[str, Any]
    error_message: str | None = None


class FakeWorkflowProvider:
    """提供可观察调用参数的外挂工作流 provider 替身。"""

    def __init__(self) -> None:
        self._submit_calls: list[WorkflowSubmitCall] = []
        self._poll_calls: list[WorkflowPollCall] = []
        self._queued_outcome = self._build_success_outcome(draft="生成后的口播稿")
        self.next_error_message = "workflow failed"
        self.provider_run_id = "provider-run-default"
        self.provider_workflow_id = "wf-script-001"
        self.provider_task_id = "task-default"
        self.poll_provider_task_id: str | None = "task-default"
        self.last_submitted_run_id: str | None = None

    def _build_success_outcome(
        self,
        *,
        draft: str,
        title: str = "一条新脚本",
        outline: str = "提纲",
        review_notes: str = "已检查",
        model_metadata: dict[str, Any] | None = None,
    ) -> QueuedWorkflowOutcome:
        """构建成功态 workflow 返回。"""
        return QueuedWorkflowOutcome(
            status="succeeded",
            outputs={
                "title": title,
                "outline": outline,
                "draft": draft,
                "used_sources": [],
                "review_notes": review_notes,
                "model_metadata": model_metadata or {"provider": "fake"},
            },
        )

    def queue_success(
        self,
        *,
        draft: str,
        title: str = "一条新脚本",
        outline: str = "提纲",
        review_notes: str = "已检查",
        model_metadata: dict[str, Any] | None = None,
    ) -> None:
        """显式编排下一次轮询返回成功结果。"""
        self._queued_outcome = self._build_success_outcome(
            draft=draft,
            title=title,
            outline=outline,
            review_notes=review_notes,
            model_metadata=model_metadata,
        )

    def queue_failure(self, *, message: str = "workflow failed") -> None:
        """显式编排下一次轮询返回失败结果。"""
        self._queued_outcome = QueuedWorkflowOutcome(status="failed", outputs={}, error_message=message)

    def submitted_calls(self) -> list[WorkflowSubmitCall]:
        """返回所有提交调用记录。"""
        return list(self._submit_calls)

    def last_submitted_inputs(self) -> dict[str, Any]:
        """返回最后一次提交的入参。"""
        if not self._submit_calls:
            raise AssertionError("workflow submit was never called")
        return self._submit_calls[-1].inputs

    def polled_run_ids(self) -> list[str]:
        """返回所有轮询过的运行 ID。"""
        return [call.run_id for call in self._poll_calls]

    async def submit_run(self, *, inputs, user_id: str) -> WorkflowProviderRun:
        """记录提交入参，并返回统一运行结构。"""
        self._submit_calls.append(WorkflowSubmitCall(inputs=inputs, user_id=user_id))
        self.last_submitted_run_id = self.provider_run_id
        return WorkflowProviderRun(
            run_id=self.provider_run_id,
            status="queued",
            outputs={},
            raw_payload={
                "workflow_run_id": self.provider_run_id,
                "task_id": self.provider_task_id,
                "data": {
                    "id": self.provider_run_id,
                    "workflow_id": self.provider_workflow_id,
                    "status": "running",
                    "outputs": {},
                },
            },
            provider_run_id=self.provider_run_id,
            provider_workflow_id=self.provider_workflow_id,
            provider_task_id=self.provider_task_id,
        )

    async def get_run(self, *, run_id: str) -> WorkflowProviderRun:
        """按测试状态返回运行查询结果。"""
        # 中文注释：强制测试使用 submit 返回的远端 run_id，避免轮询链路被假阳性掩盖。
        assert run_id == self.last_submitted_run_id, f"unexpected provider run id: {run_id}"
        self._poll_calls.append(WorkflowPollCall(run_id=run_id))
        outcome = self._queued_outcome
        outputs = dict(outcome.outputs)
        raw_payload = {"id": run_id, "workflow_id": self.provider_workflow_id, "status": outcome.status, "outputs": outputs}
        if self.poll_provider_task_id:
            raw_payload["task_id"] = self.poll_provider_task_id
        if outcome.status == "failed":
            raw_payload["error"] = outcome.error_message or self.next_error_message
            outputs = {}
        return WorkflowProviderRun(
            run_id=run_id,
            status=outcome.status,
            outputs=outputs,
            raw_payload=raw_payload,
            provider_run_id=run_id,
            provider_workflow_id=self.provider_workflow_id,
            provider_task_id=self.poll_provider_task_id,
        )

    async def aclose(self) -> None:
        """测试替身无需执行额外清理。"""
        return None


class FakeLLMProvider:
    """提供可编排返回的 LLM 替身。"""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self._queued_text = "生成后的口播稿"
        self._queued_error: Exception | None = None

    def queue_text(self, text: str) -> None:
        """显式编排下一次生成返回文本。"""
        self._queued_text = text
        self._queued_error = None

    def queue_error(self, exc: Exception) -> None:
        """显式编排下一次生成抛出异常。"""
        self._queued_error = exc

    async def generate(self, **kwargs: Any) -> str:
        """记录入参并返回编排结果。"""
        self.calls.append(kwargs)
        if self._queued_error is not None:
            raise self._queued_error
        return self._queued_text

    async def health_check(self) -> bool:
        """测试替身默认健康。"""
        return True


class FakeSTTProvider:
    """提供可编排返回的 STT 替身。"""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self._queued_text = "转写完成"
        self._queued_error: Exception | None = None

    def queue_text(self, text: str) -> None:
        """显式编排下一次转写文本。"""
        self._queued_text = text
        self._queued_error = None

    def queue_error(self, exc: Exception) -> None:
        """显式编排下一次转写抛出异常。"""
        self._queued_error = exc

    async def transcribe(self, audio_path: str) -> SimpleNamespace:
        """记录入参并返回编排结果。"""
        self.calls.append(audio_path)
        if self._queued_error is not None:
            raise self._queued_error
        return SimpleNamespace(text=self._queued_text)

    async def health_check(self) -> bool:
        """测试替身默认健康。"""
        return True
