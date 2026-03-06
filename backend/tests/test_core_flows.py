import asyncio
import io
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

os.environ["DEBUG"] = "false"
os.environ["DATABASE_URL"] = "sqlite:///./test.db"

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from main import app
from domains.transcription import upload as transcription_upload
from domains.transcription import workflow as transcription_workflow
from models import Base, Fragment
from models.database import get_db
from routers.auth import TEST_USER_ID


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

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
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
            "/api/fragments/",
            json={"transcript": transcript, "source": "manual"},
            headers=self.auth_headers(),
        )
        self.assertEqual(response.status_code, 201)
        return response.json()["data"]["id"]

    def test_auth_token_and_protected_endpoint(self) -> None:
        token_response = self.client.post("/api/auth/token", json={})
        self.assertEqual(token_response.status_code, 200)
        payload = token_response.json()["data"]
        self.assertEqual(payload["token_type"], "bearer")

        protected_response = self.client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {payload['access_token']}"},
        )
        self.assertEqual(protected_response.status_code, 200)
        protected_data = protected_response.json()["data"]
        self.assertEqual(protected_data["user_id"], TEST_USER_ID)

    def test_generate_script_success_and_failures(self) -> None:
        fragment_id = self.create_fragment()

        with patch("domains.scripts.service.get_llm_service") as mock_get_llm_service:
            mock_get_llm_service.return_value.generate = AsyncMock(return_value="生成后的口播稿")
            response = self.client.post(
                "/api/scripts/generate",
                json={"fragment_ids": [fragment_id], "mode": "mode_a"},
                headers=self.auth_headers(),
            )

        self.assertEqual(response.status_code, 201)
        script_data = response.json()["data"]
        self.assertEqual(script_data["content"], "生成后的口播稿")
        self.assertEqual(script_data["mode"], "mode_a")
        self.assertEqual(script_data["source_fragment_ids"], [fragment_id])

        missing_fragment_response = self.client.post(
            "/api/scripts/generate",
            json={"fragment_ids": ["missing-fragment"], "mode": "mode_a"},
            headers=self.auth_headers(),
        )
        self.assertEqual(missing_fragment_response.status_code, 404)

        empty_fragment_id = self.create_fragment(transcript="")
        empty_response = self.client.post(
            "/api/scripts/generate",
            json={"fragment_ids": [empty_fragment_id], "mode": "mode_a"},
            headers=self.auth_headers(),
        )
        self.assertEqual(empty_response.status_code, 422)

        with patch("domains.scripts.service.get_llm_service") as mock_get_llm_service:
            mock_get_llm_service.return_value.generate = AsyncMock(side_effect=RuntimeError("llm boom"))
            failed_response = self.client.post(
                "/api/scripts/generate",
                json={"fragment_ids": [fragment_id], "mode": "mode_a"},
                headers=self.auth_headers(),
            )

        self.assertEqual(failed_response.status_code, 422)
        self.assertEqual(failed_response.json()["error"]["code"], "VALIDATION_ERROR")

    def test_upload_audio_creates_syncing_fragment(self) -> None:
        with (
            patch("routers.transcribe.get_stt_service", return_value=object()),
            patch("domains.transcription.tasks.run_transcription_job", new=AsyncMock(return_value={"success": True})),
            patch.object(transcription_upload.settings, "UPLOAD_DIR", self.temp_dir.name),
        ):
            response = self.client.post(
                "/api/transcribe/",
                headers=self.auth_headers(),
                files={"audio": ("test.m4a", io.BytesIO(b"fake-audio"), "audio/m4a")},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(payload["sync_status"], "syncing")

        with self.SessionLocal() as db:
            fragment = db.query(Fragment).filter(Fragment.id == payload["fragment_id"]).first()
            self.assertIsNotNone(fragment)
            self.assertEqual(fragment.sync_status, "syncing")
            self.assertTrue(os.path.exists(payload["audio_path"]))

    def test_transcribe_with_retry_updates_fragment_states(self) -> None:
        with self.SessionLocal() as db:
            fragment = Fragment(
                user_id=TEST_USER_ID,
                source="voice",
                audio_path="uploads/test-user-001/test.m4a",
                sync_status="syncing",
            )
            db.add(fragment)
            db.commit()
            db.refresh(fragment)
            fragment_id = fragment.id

        fake_stt = SimpleNamespace(transcribe=AsyncMock(return_value=SimpleNamespace(text="转写完成")))
        with (
            patch.object(transcription_workflow, "SessionLocal", self.SessionLocal),
            patch.object(transcription_workflow, "get_stt_service", return_value=fake_stt),
            patch.object(transcription_workflow, "generate_summary_and_tags", AsyncMock(return_value=("摘要", ["标签"]))),
        ):
            result = asyncio.run(
                transcription_workflow.transcribe_with_retry(
                    audio_path="/tmp/test.m4a",
                    fragment_id=fragment_id,
                    user_id=TEST_USER_ID,
                    max_retries=0,
                )
            )

        self.assertTrue(result["success"])
        with self.SessionLocal() as db:
            updated = db.query(Fragment).filter(Fragment.id == fragment_id).first()
            self.assertEqual(updated.sync_status, "synced")
            self.assertEqual(updated.transcript, "转写完成")
            self.assertEqual(updated.summary, "摘要")
            self.assertEqual(updated.tags, '["标签"]')

        with self.SessionLocal() as db:
            failed_fragment = Fragment(
                user_id=TEST_USER_ID,
                source="voice",
                audio_path="uploads/test-user-001/test-failed.m4a",
                sync_status="syncing",
            )
            db.add(failed_fragment)
            db.commit()
            db.refresh(failed_fragment)
            failed_fragment_id = failed_fragment.id

        fake_failed_stt = SimpleNamespace(transcribe=AsyncMock(side_effect=RuntimeError("stt fail")))
        with (
            patch.object(transcription_workflow, "SessionLocal", self.SessionLocal),
            patch.object(transcription_workflow, "get_stt_service", return_value=fake_failed_stt),
            patch.object(transcription_workflow, "generate_summary_and_tags", AsyncMock(return_value=("摘要", ["标签"]))),
            patch("domains.transcription.workflow.asyncio.sleep", new=AsyncMock(return_value=None)),
        ):
            result = asyncio.run(
                transcription_workflow.transcribe_with_retry(
                    audio_path="/tmp/test-failed.m4a",
                    fragment_id=failed_fragment_id,
                    user_id=TEST_USER_ID,
                    max_retries=1,
                )
            )

        self.assertFalse(result["success"])
        with self.SessionLocal() as db:
            failed = db.query(Fragment).filter(Fragment.id == failed_fragment_id).first()
            self.assertEqual(failed.sync_status, "failed")
