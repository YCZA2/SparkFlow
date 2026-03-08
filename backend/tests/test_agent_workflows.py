import json
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock

os.environ["DEBUG"] = "false"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["DIFY_BASE_URL"] = "https://dify.example.com/v1"
os.environ["DIFY_API_KEY"] = "test-key"
os.environ["DIFY_SCRIPT_WORKFLOW_ID"] = "wf-script-001"

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from core.config import settings
from core.auth import create_access_token
from main import create_app
from models import AgentRun, Base, Script
from modules.auth.application import TEST_USER_ID
from modules.shared.container import LocalAudioStorage, LocalImportedAudioStorage, PromptLoader
from modules.shared.ports import WebSearchResult


class FakeVectorStore:
    def __init__(self) -> None:
        self.knowledge_results: list[dict] = []

    async def upsert_fragment(self, **kwargs):
        return True

    async def query_fragments(self, **kwargs):
        return []

    async def list_fragment_documents(self, **kwargs):
        return []

    async def upsert_knowledge_doc(self, **kwargs):
        return "ref"

    async def query_knowledge_docs(self, *, user_id: str, query_text: str, top_k: int):
        return self.knowledge_results[:top_k]

    async def delete_knowledge_doc(self, **kwargs):
        return True

    async def health_check(self):
        return True


class FakeWebSearchProvider:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def search(self, *, query_text: str, top_k: int):
        self.calls.append(query_text)
        return [WebSearchResult(title="A", url="https://example.com", snippet="snippet")][:top_k]


class AgentWorkflowApiTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(bind=self.engine)

        self.app = create_app()
        settings.DIFY_BASE_URL = "https://dify.example.com/v1"
        settings.DIFY_API_KEY = "test-key"
        settings.DIFY_SCRIPT_WORKFLOW_ID = "wf-script-001"
        self.app.state.container.session_factory = self.SessionLocal
        self.app.state.container.audio_storage = LocalAudioStorage(self.temp_dir.name)
        self.app.state.container.imported_audio_storage = LocalImportedAudioStorage(self.temp_dir.name)
        self.app.state.container.vector_store = FakeVectorStore()
        self.app.state.container.web_search_provider = FakeWebSearchProvider()
        self.app.state.container.prompt_loader = PromptLoader(Path.cwd() / "prompts")
        self.app.state.container.llm_provider = SimpleNamespace(generate=AsyncMock(return_value="unused"), health_check=AsyncMock(return_value=True))
        self.app.state.container.stt_provider = SimpleNamespace(transcribe=AsyncMock(return_value=SimpleNamespace(text="转写完成")), health_check=AsyncMock(return_value=True))
        self.app.state.container.dify_http_client = httpx.AsyncClient(transport=httpx.MockTransport(self._handle_dify_request))
        self.client = TestClient(self.app)
        self.next_status = "succeeded"
        self.submitted_runs: list[str] = []

    def tearDown(self) -> None:
        self.app.state.scheduler_service.stop()
        __import__("asyncio").run(self.app.state.container.dify_http_client.aclose())
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()
        self.temp_dir.cleanup()

    def _handle_dify_request(self, request: httpx.Request) -> httpx.Response:
        if request.method == "POST" and request.url.path.endswith("/workflows/run"):
            payload = json.loads(request.content.decode("utf-8"))
            self.assertIn("selected_fragments", payload["inputs"])
            run_id = "dify-run-001"
            self.submitted_runs.append(run_id)
            return httpx.Response(200, json={"data": {"id": run_id, "workflow_id": "wf-script-001", "status": "running", "outputs": {}}})
        if request.method == "GET" and request.url.path.endswith("/workflows/run/dify-run-001"):
            status = self.next_status
            outputs = {
                "title": "一条新脚本",
                "outline": "提纲",
                "draft": "这是 Dify 生成的口播稿",
                "used_sources": [{"type": "knowledge", "title": "定位文档"}],
                "review_notes": "已自检",
            }
            if status == "failed":
                return httpx.Response(200, json={"data": {"id": "dify-run-001", "workflow_id": "wf-script-001", "status": status, "error": "workflow failed", "outputs": {}}})
            return httpx.Response(200, json={"data": {"id": "dify-run-001", "workflow_id": "wf-script-001", "status": status, "outputs": outputs}})
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    def auth_headers(self, client: TestClient | None = None) -> dict[str, str]:
        api_client = client or self.client
        response = api_client.post("/api/auth/token", json={})
        token = response.json()["data"]["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def create_fragment(self, transcript: str) -> str:
        response = self.client.post("/api/fragments", json={"transcript": transcript, "source": "manual"}, headers=self.auth_headers())
        self.assertEqual(response.status_code, 201)
        return response.json()["data"]["id"]

    def create_knowledge_doc(self, *, title: str, content: str) -> str:
        response = self.client.post(
            "/api/knowledge",
            json={"title": title, "content": content, "doc_type": "high_likes"},
            headers=self.auth_headers(),
        )
        self.assertEqual(response.status_code, 200)
        return response.json()["data"]["id"]

    def test_create_run_and_refresh_to_script(self) -> None:
        fragment_id = self.create_fragment("关于定位的一条碎片")
        knowledge_doc_id = self.create_knowledge_doc(title="定位文档", content="关于定位的经验")
        self.app.state.container.vector_store.knowledge_results = [{"doc_id": knowledge_doc_id, "score": 0.91}]

        create_response = self.client.post(
            "/api/agent/script-research-runs",
            json={"fragment_ids": [fragment_id], "mode": "mode_a", "query_hint": "写一篇关于定位的口播稿", "include_web_search": True},
            headers=self.auth_headers(),
        )
        self.assertEqual(create_response.status_code, 201)
        run_id = create_response.json()["data"]["id"]
        self.assertEqual(create_response.json()["data"]["status"], "running")

        refresh_response = self.client.post(f"/api/agent/runs/{run_id}/refresh", headers=self.auth_headers())
        self.assertEqual(refresh_response.status_code, 200)
        payload = refresh_response.json()["data"]
        self.assertEqual(payload["status"], "succeeded")
        self.assertTrue(payload["script_id"])
        self.assertEqual(payload["result"]["draft"], "这是 Dify 生成的口播稿")
        self.assertEqual(len(self.app.state.container.web_search_provider.calls), 1)

        with self.SessionLocal() as db:
            run = db.query(AgentRun).filter(AgentRun.id == run_id).first()
            script = db.query(Script).filter(Script.id == payload["script_id"]).first()
            self.assertIsNotNone(run)
            self.assertIsNotNone(script)
            self.assertEqual(run.script_id, script.id)
            self.assertEqual(script.content, "这是 Dify 生成的口播稿")

    def test_refresh_failed_run_returns_error(self) -> None:
        fragment_id = self.create_fragment("关于选题的一条碎片")
        create_response = self.client.post(
            "/api/agent/script-research-runs",
            json={"fragment_ids": [fragment_id], "mode": "mode_a"},
            headers=self.auth_headers(),
        )
        self.assertEqual(create_response.status_code, 201)
        run_id = create_response.json()["data"]["id"]

        self.next_status = "failed"
        refresh_response = self.client.post(f"/api/agent/runs/{run_id}/refresh", headers=self.auth_headers())
        self.assertEqual(refresh_response.status_code, 200)
        self.assertEqual(refresh_response.json()["data"]["status"], "failed")
        self.assertIn("workflow failed", refresh_response.json()["data"]["error_message"])

    def test_other_user_cannot_read_run(self) -> None:
        fragment_id = self.create_fragment("关于表达方式的一条碎片")
        create_response = self.client.post(
            "/api/agent/script-research-runs",
            json={"fragment_ids": [fragment_id], "mode": "mode_a"},
            headers=self.auth_headers(),
        )
        self.assertEqual(create_response.status_code, 201)
        run_id = create_response.json()["data"]["id"]

        other_headers = {"Authorization": f"Bearer {create_access_token(user_id='other-user-001', role='user')}"}
        forbidden = self.client.get(f"/api/agent/runs/{run_id}", headers=other_headers)
        self.assertEqual(forbidden.status_code, 404)
