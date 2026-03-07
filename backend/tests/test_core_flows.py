import io
import os
import tempfile
import unittest
import asyncio
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ["DEBUG"] = "false"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import create_app
from models import Base, Fragment, KnowledgeDoc, Script
from modules.auth.application import TEST_USER_ID
from modules.shared.container import LocalAudioStorage, PromptLoader


class FakeVectorStore:
    def __init__(self) -> None:
        self.fragment_docs: dict[str, dict] = {}
        self.knowledge_docs: dict[str, dict] = {}

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

    async def query_fragments(self, *, user_id: str, query_text: str, top_k: int, exclude_ids=None):
        exclude = set(exclude_ids or [])
        items = [
            {
                "fragment_id": fragment_id,
                "score": 0.95 if query_text in payload["text"] else 0.8,
                "metadata": {"source": payload["source"]},
            }
            for fragment_id, payload in self.fragment_docs.items()
            if payload["user_id"] == user_id and fragment_id not in exclude
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


class BackendFlowTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(bind=self.engine)

        self.app = create_app()
        self.app.state.container.session_factory = self.SessionLocal
        self.app.state.container.audio_storage = LocalAudioStorage(self.temp_dir.name)
        self.app.state.container.vector_store = FakeVectorStore()
        self.app.state.container.prompt_loader = PromptLoader(Path.cwd() / "prompts")
        self.app.state.container.llm_provider = SimpleNamespace(
            generate=AsyncMock(return_value="生成后的口播稿"),
            health_check=AsyncMock(return_value=True),
        )
        self.app.state.container.stt_provider = SimpleNamespace(
            transcribe=AsyncMock(return_value=SimpleNamespace(text="转写完成")),
            health_check=AsyncMock(return_value=True),
        )
        self.client = TestClient(self.app)

    def tearDown(self) -> None:
        self.app.state.scheduler_service.stop()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()
        self.temp_dir.cleanup()

    def auth_headers(self) -> dict[str, str]:
        response = self.client.post("/api/auth/token", json={})
        self.assertEqual(response.status_code, 200)
        token = response.json()["data"]["access_token"]
        return {"Authorization": f"Bearer {token}"}

    def create_fragment(self, transcript: str = "一条可用于生成稿件的碎片") -> str:
        response = self.client.post(
            "/api/fragments",
            json={"transcript": transcript, "source": "manual"},
            headers=self.auth_headers(),
        )
        self.assertEqual(response.status_code, 201)
        return response.json()["data"]["id"]

    def seed_fragment_vector(self, fragment_id: str, transcript: str, *, source: str = "manual") -> None:
        self.app.state.container.vector_store.fragment_docs[fragment_id] = {
            "user_id": TEST_USER_ID,
            "fragment_id": fragment_id,
            "text": transcript,
            "source": source,
            "summary": None,
            "tags": [],
        }

    def create_script(self, fragment_ids: list[str], mode: str = "mode_a") -> str:
        response = self.client.post(
            "/api/scripts/generation",
            json={"fragment_ids": fragment_ids, "mode": mode},
            headers=self.auth_headers(),
        )
        self.assertEqual(response.status_code, 201)
        return response.json()["data"]["id"]

    def test_auth_token_me_and_refresh(self) -> None:
        token_response = self.client.post("/api/auth/token", json={})
        self.assertEqual(token_response.status_code, 200)
        payload = token_response.json()["data"]
        self.assertEqual(payload["token_type"], "bearer")

        protected_response = self.client.get("/api/auth/me", headers={"Authorization": f"Bearer {payload['access_token']}"})
        self.assertEqual(protected_response.status_code, 200)
        self.assertEqual(protected_response.json()["data"]["user_id"], TEST_USER_ID)

        refresh_response = self.client.post("/api/auth/refresh", headers={"Authorization": f"Bearer {payload['access_token']}"})
        self.assertEqual(refresh_response.status_code, 200)
        refreshed = refresh_response.json()["data"]
        self.assertEqual(refreshed["token_type"], "bearer")
        self.assertTrue(refreshed["access_token"])

    def test_fragments_collection_detail_similarity_and_visualization(self) -> None:
        first_id = self.create_fragment("定位方法论的第一条碎片")
        second_id = self.create_fragment("定位方法论的第二条碎片")
        self.seed_fragment_vector(first_id, "定位方法论的第一条碎片")
        self.seed_fragment_vector(second_id, "定位方法论的第二条碎片")

        list_response = self.client.get("/api/fragments", headers=self.auth_headers())
        self.assertEqual(list_response.status_code, 200)
        listed_ids = {item["id"] for item in list_response.json()["data"]["items"]}
        self.assertIn(first_id, listed_ids)
        self.assertIn(second_id, listed_ids)

        detail_response = self.client.get(f"/api/fragments/{first_id}", headers=self.auth_headers())
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.json()["data"]["id"], first_id)

        similar_response = self.client.post(
            "/api/fragments/similar",
            json={"query_text": "定位方法论", "top_k": 5, "exclude_ids": [first_id]},
            headers=self.auth_headers(),
        )
        self.assertEqual(similar_response.status_code, 200)
        similar_items = similar_response.json()["data"]["items"]
        self.assertEqual(len(similar_items), 1)
        self.assertEqual(similar_items[0]["id"], second_id)

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
                    "sync_status": "synced",
                    "created_at": "2026-03-07T00:00:00+08:00",
                    "cluster_id": 1,
                    "is_noise": False,
                }
            ],
            "clusters": [
                {
                    "id": 1,
                    "label": "定位",
                    "keywords": ["定位", "方法论"],
                    "fragment_count": 1,
                    "centroid": {"x": 0.1, "y": 0.2, "z": 0.3},
                }
            ],
            "stats": {"total_fragments": 1, "clustered_fragments": 1, "uncategorized_fragments": 0},
            "meta": {"projection": "pca", "clustering": "kmeans", "used_vector_source": "fake"},
        }
        with patch("modules.fragments.application.build_fragment_visualization", new=AsyncMock(return_value=visualization_payload)):
            visualization_response = self.client.get("/api/fragments/visualization", headers=self.auth_headers())
        self.assertEqual(visualization_response.status_code, 200)
        self.assertEqual(visualization_response.json()["data"]["points"][0]["id"], first_id)

    def test_generate_script_success_and_failures(self) -> None:
        fragment_id = self.create_fragment()

        response = self.client.post(
            "/api/scripts/generation",
            json={"fragment_ids": [fragment_id], "mode": "mode_a"},
            headers=self.auth_headers(),
        )
        self.assertEqual(response.status_code, 201)
        script_data = response.json()["data"]
        self.assertEqual(script_data["content"], "生成后的口播稿")
        self.assertEqual(script_data["mode"], "mode_a")
        self.assertEqual(script_data["source_fragment_ids"], [fragment_id])

        missing_fragment_response = self.client.post(
            "/api/scripts/generation",
            json={"fragment_ids": ["missing-fragment"], "mode": "mode_a"},
            headers=self.auth_headers(),
        )
        self.assertEqual(missing_fragment_response.status_code, 404)
        self.assertEqual(missing_fragment_response.json()["error"]["code"], "NOT_FOUND")

        empty_fragment_id = self.create_fragment(transcript="")
        empty_response = self.client.post(
            "/api/scripts/generation",
            json={"fragment_ids": [empty_fragment_id], "mode": "mode_a"},
            headers=self.auth_headers(),
        )
        self.assertEqual(empty_response.status_code, 422)
        self.assertEqual(empty_response.json()["error"]["code"], "VALIDATION")

    def test_scripts_list_detail_update_and_delete(self) -> None:
        fragment_id = self.create_fragment("用于脚本列表和详情测试")
        script_id = self.create_script([fragment_id])

        list_response = self.client.get("/api/scripts", headers=self.auth_headers())
        self.assertEqual(list_response.status_code, 200)
        script_ids = {item["id"] for item in list_response.json()["data"]["items"]}
        self.assertIn(script_id, script_ids)

        detail_response = self.client.get(f"/api/scripts/{script_id}", headers=self.auth_headers())
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.json()["data"]["id"], script_id)

        update_response = self.client.patch(
            f"/api/scripts/{script_id}",
            json={"status": "ready", "title": "新的标题"},
            headers=self.auth_headers(),
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["data"]["status"], "ready")
        self.assertEqual(update_response.json()["data"]["title"], "新的标题")

        delete_response = self.client.delete(f"/api/scripts/{script_id}", headers=self.auth_headers())
        self.assertEqual(delete_response.status_code, 204)

        not_found_response = self.client.get(f"/api/scripts/{script_id}", headers=self.auth_headers())
        self.assertEqual(not_found_response.status_code, 404)

    def test_upload_audio_transitions_to_synced(self) -> None:
        response = self.client.post(
            "/api/transcriptions",
            headers=self.auth_headers(),
            files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(payload["sync_status"], "syncing")

        status_response = self.client.get(f"/api/transcriptions/{payload['fragment_id']}", headers=self.auth_headers())
        self.assertEqual(status_response.status_code, 200)
        self.assertIn(status_response.json()["data"]["sync_status"], {"syncing", "synced"})

        with self.SessionLocal() as db:
            fragment = db.query(Fragment).filter(Fragment.id == payload["fragment_id"]).first()
            self.assertIsNotNone(fragment)
            self.assertEqual(fragment.sync_status, "synced")
            self.assertEqual(fragment.transcript, "转写完成")
            self.assertTrue(os.path.exists(payload["audio_path"]))

    def test_upload_audio_marks_failed_when_stt_crashes(self) -> None:
        self.app.state.container.stt_provider = SimpleNamespace(
            transcribe=AsyncMock(side_effect=RuntimeError("stt boom")),
            health_check=AsyncMock(return_value=True),
        )
        response = self.client.post(
            "/api/transcriptions",
            headers=self.auth_headers(),
            files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]

        with self.SessionLocal() as db:
            fragment = db.query(Fragment).filter(Fragment.id == payload["fragment_id"]).first()
            self.assertEqual(fragment.sync_status, "failed")

    def test_upload_audio_uses_fallback_enrichment_when_llm_is_too_slow(self) -> None:
        async def slow_generate(**kwargs):
            await asyncio.sleep(0.05)
            return "不会被用到"

        self.app.state.container.llm_provider = SimpleNamespace(
            generate=slow_generate,
            health_check=AsyncMock(return_value=True),
        )

        with patch("modules.transcriptions.application.ENRICHMENT_TIMEOUT_SECONDS", 0.01):
            response = self.client.post(
                "/api/transcriptions",
                headers=self.auth_headers(),
                files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]

        with self.SessionLocal() as db:
            fragment = db.query(Fragment).filter(Fragment.id == payload["fragment_id"]).first()
            self.assertIsNotNone(fragment)
            self.assertEqual(fragment.sync_status, "synced")
            self.assertEqual(fragment.transcript, "转写完成")
            self.assertTrue(fragment.summary)
            self.assertTrue(fragment.tags)

    def test_upload_audio_marks_failed_when_transcription_is_cancelled(self) -> None:
        self.app.state.container.stt_provider = SimpleNamespace(
            transcribe=AsyncMock(side_effect=asyncio.CancelledError()),
            health_check=AsyncMock(return_value=True),
        )

        response = self.client.post(
            "/api/transcriptions",
            headers=self.auth_headers(),
            files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]

        with self.SessionLocal() as db:
            fragment = db.query(Fragment).filter(Fragment.id == payload["fragment_id"]).first()
            self.assertIsNotNone(fragment)
            self.assertEqual(fragment.sync_status, "failed")

    def test_delete_fragment_removes_audio_file(self) -> None:
        upload_root = Path(self.temp_dir.name).resolve()
        user_dir = upload_root / TEST_USER_ID
        user_dir.mkdir(parents=True, exist_ok=True)
        audio_file = user_dir / "delete-me.m4a"
        audio_file.write_bytes(b"fake-audio")
        relative_audio_path = str(audio_file.relative_to(upload_root.parent))

        with self.SessionLocal() as db:
            fragment = Fragment(
                user_id=TEST_USER_ID,
                transcript="待删除的碎片",
                audio_path=relative_audio_path,
                source="voice",
                sync_status="synced",
            )
            db.add(fragment)
            db.commit()
            db.refresh(fragment)
            fragment_id = fragment.id

        response = self.client.delete(f"/api/fragments/{fragment_id}", headers=self.auth_headers())
        self.assertEqual(response.status_code, 204)
        self.assertFalse(audio_file.exists())

    def test_scripts_daily_push_trigger_get_force_trigger_and_idempotency(self) -> None:
        fragment_ids = [self.create_fragment(f"同主题内容 {index}") for index in range(3)]
        with self.SessionLocal() as db:
            fragments = db.query(Fragment).filter(Fragment.id.in_(fragment_ids)).all()
            for fragment in fragments:
                fragment.sync_status = "synced"
                self.seed_fragment_vector(fragment.id, fragment.transcript, source=fragment.source)
            db.commit()

        first_response = self.client.post("/api/scripts/daily-push/trigger", headers=self.auth_headers())
        self.assertEqual(first_response.status_code, 200)
        daily_push_id = first_response.json()["data"]["id"]

        get_response = self.client.get("/api/scripts/daily-push", headers=self.auth_headers())
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.json()["data"]["id"], daily_push_id)

        second_response = self.client.post("/api/scripts/daily-push/trigger", headers=self.auth_headers())
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(second_response.json()["data"]["id"], daily_push_id)

        force_response = self.client.post("/api/scripts/daily-push/force-trigger", headers=self.auth_headers())
        self.assertEqual(force_response.status_code, 200)
        self.assertEqual(force_response.json()["data"]["id"], daily_push_id)

    def test_knowledge_doc_create_upload_list_get_search_and_delete(self) -> None:
        create_response = self.client.post(
            "/api/knowledge",
            json={"title": "高赞案例", "content": "定位方法论与爆款选题", "doc_type": "high_likes"},
            headers=self.auth_headers(),
        )
        self.assertEqual(create_response.status_code, 200)
        doc_id = create_response.json()["data"]["id"]

        upload_response = self.client.post(
            "/api/knowledge/upload",
            headers=self.auth_headers(),
            files={"file": ("habit.txt", io.BytesIO("表达风格与语言习惯".encode("utf-8")), "text/plain")},
            data={"title": "语言习惯", "doc_type": "language_habit"},
        )
        self.assertEqual(upload_response.status_code, 200)
        uploaded_doc_id = upload_response.json()["data"]["id"]

        list_response = self.client.get("/api/knowledge", headers=self.auth_headers())
        self.assertEqual(list_response.status_code, 200)
        listed_ids = {item["id"] for item in list_response.json()["data"]["items"]}
        self.assertIn(doc_id, listed_ids)
        self.assertIn(uploaded_doc_id, listed_ids)

        detail_response = self.client.get(f"/api/knowledge/{doc_id}", headers=self.auth_headers())
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.json()["data"]["id"], doc_id)

        search_response = self.client.post(
            "/api/knowledge/search",
            json={"query_text": "定位方法论", "top_k": 5},
            headers=self.auth_headers(),
        )
        self.assertEqual(search_response.status_code, 200)
        self.assertEqual(search_response.json()["data"]["items"][0]["id"], doc_id)

        delete_response = self.client.delete(f"/api/knowledge/{uploaded_doc_id}", headers=self.auth_headers())
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(delete_response.json()["success"])

        with self.SessionLocal() as db:
            doc = db.query(KnowledgeDoc).filter(KnowledgeDoc.id == doc_id).first()
            self.assertIsNotNone(doc)
            self.assertTrue(doc.vector_ref_id)
            deleted = db.query(KnowledgeDoc).filter(KnowledgeDoc.id == uploaded_doc_id).first()
            self.assertIsNone(deleted)

    def test_dependency_wiring_smoke(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["services"]["llm"], "available")
        self.assertEqual(payload["services"]["stt"], "available")
        self.assertEqual(payload["services"]["vector_db"], "available")
