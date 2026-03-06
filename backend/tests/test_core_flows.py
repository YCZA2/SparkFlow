import asyncio
from datetime import datetime, timedelta
import io
import json
import os
from pathlib import Path
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
from domains.fragments import service as fragment_service
from domains.scripts import service as script_service
from models import Base, Fragment, Script
from models.database import get_db
from routers.auth import TEST_USER_ID
from services.base import VectorDocument
from services import scheduler as scheduler_service
from services import vector_visualization_service
from utils.time import get_local_day_bounds


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

        with patch.object(fragment_service.settings, "UPLOAD_DIR", str(upload_root)):
            response = self.client.delete(
                f"/api/fragments/{fragment_id}",
                headers=self.auth_headers(),
            )

        self.assertEqual(response.status_code, 204)
        self.assertFalse(audio_file.exists())

        with self.SessionLocal() as db:
            deleted = db.query(Fragment).filter(Fragment.id == fragment_id).first()
            self.assertIsNone(deleted)

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
            patch.object(transcription_workflow, "upsert_fragment", AsyncMock(return_value=True)) as mock_upsert_fragment,
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
        mock_upsert_fragment.assert_awaited_once_with(
            user_id=TEST_USER_ID,
            fragment_id=fragment_id,
            text="转写完成",
            source="voice",
            summary="摘要",
            tags=["标签"],
        )
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

    def test_transcribe_with_retry_keeps_success_when_vectorization_fails(self) -> None:
        with self.SessionLocal() as db:
            fragment = Fragment(
                user_id=TEST_USER_ID,
                source="voice",
                audio_path="uploads/test-user-001/test-vector-fail.m4a",
                sync_status="syncing",
            )
            db.add(fragment)
            db.commit()
            db.refresh(fragment)
            fragment_id = fragment.id

        fake_stt = SimpleNamespace(transcribe=AsyncMock(return_value=SimpleNamespace(text="转写成功但向量化失败")))
        with (
            patch.object(transcription_workflow, "SessionLocal", self.SessionLocal),
            patch.object(transcription_workflow, "get_stt_service", return_value=fake_stt),
            patch.object(transcription_workflow, "generate_summary_and_tags", AsyncMock(return_value=("摘要", ["标签1", "标签2"]))),
            patch.object(transcription_workflow, "upsert_fragment", AsyncMock(side_effect=RuntimeError("vector boom"))),
        ):
            result = asyncio.run(
                transcription_workflow.transcribe_with_retry(
                    audio_path="/tmp/test-vector-fail.m4a",
                    fragment_id=fragment_id,
                    user_id=TEST_USER_ID,
                    max_retries=0,
                )
            )

        self.assertTrue(result["success"])
        with self.SessionLocal() as db:
            updated = db.query(Fragment).filter(Fragment.id == fragment_id).first()
            self.assertEqual(updated.sync_status, "synced")
            self.assertEqual(updated.transcript, "转写成功但向量化失败")
            self.assertEqual(updated.summary, "摘要")
            self.assertEqual(updated.tags, json.dumps(["标签1", "标签2"], ensure_ascii=False))

    def test_query_similar_fragments_endpoint(self) -> None:
        with self.SessionLocal() as db:
            fragment_1 = Fragment(
                user_id=TEST_USER_ID,
                transcript="定位要先找到自己的差异化表达",
                summary="定位差异化",
                tags=json.dumps(["定位", "差异化"], ensure_ascii=False),
                source="voice",
                sync_status="synced",
            )
            fragment_2 = Fragment(
                user_id=TEST_USER_ID,
                transcript="口播开头三秒要先抛结论",
                summary="口播开头",
                tags=json.dumps(["口播", "开头"], ensure_ascii=False),
                source="voice",
                sync_status="synced",
            )
            db.add_all([fragment_1, fragment_2])
            db.commit()
            db.refresh(fragment_1)
            db.refresh(fragment_2)

        fake_results = [
            {
                "id": fragment_1.id,
                "transcript": fragment_1.transcript,
                "summary": fragment_1.summary,
                "tags": ["定位", "差异化"],
                "source": "voice",
                "sync_status": "synced",
                "created_at": "2026-03-06T00:00:00+00:00",
                "score": 0.93,
                "metadata": {"type": "fragment"},
            },
            {
                "id": fragment_2.id,
                "transcript": fragment_2.transcript,
                "summary": fragment_2.summary,
                "tags": ["口播", "开头"],
                "source": "voice",
                "sync_status": "synced",
                "created_at": "2026-03-06T00:00:00+00:00",
                "score": 0.71,
                "metadata": {"type": "fragment"},
            },
        ]
        with patch.object(fragment_service, "query_similar_fragments", AsyncMock(return_value=fake_results)):
            response = self.client.post(
                "/api/fragments/similar",
                json={
                    "query_text": "我想找和定位相关的历史灵感",
                    "top_k": 2,
                    "exclude_ids": [fragment_2.id],
                },
                headers=self.auth_headers(),
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(payload["total"], 2)
        self.assertEqual(payload["query_text"], "我想找和定位相关的历史灵感")
        self.assertEqual(payload["items"][0]["id"], fragment_1.id)
        self.assertEqual(payload["items"][0]["score"], 0.93)

    def test_fragment_service_query_similar_fragments_filters_missing_rows(self) -> None:
        with self.SessionLocal() as db:
            fragment = Fragment(
                user_id=TEST_USER_ID,
                transcript="用户表达要保留真实感",
                summary="表达真实感",
                tags=json.dumps(["表达", "真实感"], ensure_ascii=False),
                source="voice",
                sync_status="synced",
            )
            db.add(fragment)
            db.commit()
            db.refresh(fragment)

            with patch.object(
                fragment_service,
                "query_similar_fragments_from_vector_db",
                AsyncMock(
                    return_value=[
                        {
                            "fragment_id": fragment.id,
                            "transcript": fragment.transcript,
                            "score": 0.88,
                            "metadata": {"source": "voice"},
                        },
                        {
                            "fragment_id": "missing-fragment",
                            "transcript": "不存在的向量结果",
                            "score": 0.55,
                            "metadata": {"source": "voice"},
                        },
                    ]
                ),
            ):
                result = asyncio.run(
                    fragment_service.query_similar_fragments(
                        db=db,
                        user_id=TEST_USER_ID,
                        query_text="找表达风格",
                        top_k=5,
                        exclude_ids=[],
                    )
                )

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["id"], fragment.id)
        self.assertEqual(result[0]["score"], 0.88)
        self.assertEqual(result[0]["metadata"], {"source": "voice"})

    def test_build_fragment_visualization_filters_missing_rows_for_small_dataset(self) -> None:
        with self.SessionLocal() as db:
            fragments = []
            for index in range(3):
                fragment = Fragment(
                    user_id=TEST_USER_ID,
                    transcript=f"碎片 {index}",
                    summary=f"主题 {index}",
                    tags=json.dumps([f"标签{index}"], ensure_ascii=False),
                    source="voice",
                    sync_status="synced",
                )
                db.add(fragment)
                fragments.append(fragment)
            db.commit()
            for fragment in fragments:
                db.refresh(fragment)

            vector_docs = [
                VectorDocument(
                    id=fragment.id,
                    text=fragment.transcript or "",
                    embedding=[float(index + 1), float(index + 2), float(index + 3)],
                    metadata={"type": "fragment"},
                )
                for index, fragment in enumerate(fragments)
            ]
            vector_docs.append(
                VectorDocument(
                    id="deleted-fragment",
                    text="已被删除的碎片",
                    embedding=[9.0, 9.0, 9.0],
                    metadata={"type": "fragment"},
                )
            )

            with patch.object(
                vector_visualization_service,
                "list_fragment_documents",
                AsyncMock(return_value=vector_docs),
            ):
                payload = asyncio.run(
                    vector_visualization_service.build_fragment_visualization(
                        db=db,
                        user_id=TEST_USER_ID,
                    )
                )

        self.assertEqual(payload["stats"]["total_fragments"], 3)
        self.assertEqual(payload["stats"]["clustered_fragments"], 0)
        self.assertEqual(payload["stats"]["uncategorized_fragments"], 3)
        self.assertEqual(payload["clusters"], [])
        self.assertEqual({point["id"] for point in payload["points"]}, {fragment.id for fragment in fragments})

    def test_build_fragment_visualization_backfills_existing_fragments_without_vectors(self) -> None:
        with self.SessionLocal() as db:
            fragment = Fragment(
                user_id=TEST_USER_ID,
                transcript="已经存在的旧碎片",
                summary="旧碎片摘要",
                tags=json.dumps(["旧碎片", "回填"], ensure_ascii=False),
                source="manual",
                sync_status="synced",
            )
            db.add(fragment)
            db.commit()
            db.refresh(fragment)

            vector_docs = [
                VectorDocument(
                    id=fragment.id,
                    text=fragment.transcript or "",
                    embedding=[0.3, 0.6, 0.9],
                    metadata={"type": "fragment"},
                )
            ]

            with (
                patch.object(
                    vector_visualization_service,
                    "list_fragment_documents",
                    AsyncMock(side_effect=[[], vector_docs]),
                ),
                patch.object(
                    vector_visualization_service,
                    "upsert_fragment",
                    AsyncMock(return_value=True),
                ) as mock_upsert_fragment,
            ):
                payload = asyncio.run(
                    vector_visualization_service.build_fragment_visualization(
                        db=db,
                        user_id=TEST_USER_ID,
                    )
                )

        mock_upsert_fragment.assert_awaited_once_with(
            user_id=TEST_USER_ID,
            fragment_id=fragment.id,
            text="已经存在的旧碎片",
            source="manual",
            summary="旧碎片摘要",
            tags=["旧碎片", "回填"],
        )
        self.assertEqual(payload["stats"]["total_fragments"], 1)
        self.assertEqual(payload["points"][0]["id"], fragment.id)

    def test_build_fragment_visualization_falls_back_to_text_features_when_backfill_fails(self) -> None:
        with self.SessionLocal() as db:
            fragments = []
            for index in range(2):
                fragment = Fragment(
                    user_id=TEST_USER_ID,
                    transcript=f"定位表达样本 {index}",
                    summary="定位表达",
                    tags=json.dumps(["定位", "表达"], ensure_ascii=False),
                    source="manual",
                    sync_status="synced",
                )
                db.add(fragment)
                fragments.append(fragment)
            db.commit()

            with (
                patch.object(
                    vector_visualization_service,
                    "list_fragment_documents",
                    AsyncMock(side_effect=[[], []]),
                ),
                patch.object(
                    vector_visualization_service,
                    "upsert_fragment",
                    AsyncMock(side_effect=RuntimeError("embedding unavailable")),
                ),
            ):
                payload = asyncio.run(
                    vector_visualization_service.build_fragment_visualization(
                        db=db,
                        user_id=TEST_USER_ID,
                    )
                )

        self.assertEqual(payload["meta"]["used_vector_source"], "fallback_text_features")
        self.assertEqual(payload["stats"]["total_fragments"], 2)
        self.assertEqual(len(payload["points"]), 2)
        self.assertEqual({point["id"] for point in payload["points"]}, {fragment.id for fragment in fragments})

    def test_get_fragment_visualization_endpoint_returns_clustered_payload(self) -> None:
        with self.SessionLocal() as db:
            fragments = []
            for index in range(8):
                is_positioning = index < 4
                fragment = Fragment(
                    user_id=TEST_USER_ID,
                    transcript=f"碎片 {index}",
                    summary="定位表达" if is_positioning else "口播开头",
                    tags=json.dumps(
                        ["定位", "表达"] if is_positioning else ["口播", "开头"],
                        ensure_ascii=False,
                    ),
                    source="voice",
                    sync_status="synced",
                )
                db.add(fragment)
                fragments.append(fragment)
            db.commit()
            for fragment in fragments:
                db.refresh(fragment)

        vector_docs: list[VectorDocument] = []
        for index, fragment in enumerate(fragments):
            if index < 4:
                embedding = [1.0 + index * 0.05, 0.9 + index * 0.04, 1.1 + index * 0.03]
            else:
                offset = index - 4
                embedding = [-1.1 - offset * 0.04, -0.9 - offset * 0.03, -1.0 - offset * 0.05]
            vector_docs.append(
                VectorDocument(
                    id=fragment.id,
                    text=fragment.transcript or "",
                    embedding=embedding,
                    metadata={"type": "fragment"},
                )
            )

        with patch.object(
            vector_visualization_service,
            "list_fragment_documents",
            AsyncMock(return_value=vector_docs),
        ):
            response = self.client.get(
                "/api/fragments/visualization",
                headers=self.auth_headers(),
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(payload["stats"]["total_fragments"], 8)
        self.assertEqual(len(payload["points"]), 8)
        self.assertEqual(len(payload["clusters"]), 2)
        self.assertEqual(payload["stats"]["clustered_fragments"], 8)
        self.assertEqual(payload["meta"]["projection"], "pca")
        self.assertEqual(payload["meta"]["clustering"], "kmeans")
        cluster_labels = {cluster["label"] for cluster in payload["clusters"]}
        self.assertTrue(cluster_labels.issubset({"定位", "表达", "口播", "开头"}))

    def test_get_fragment_visualization_requires_auth(self) -> None:
        response = self.client.get("/api/fragments/visualization")
        self.assertEqual(response.status_code, 401)

    def test_daily_aggregate_generates_ready_daily_push_script(self) -> None:
        self.auth_headers()
        reference_time = datetime.fromisoformat("2026-03-06T08:00:00+00:00")
        yesterday_start, _ = get_local_day_bounds(reference_time, day_offset=-1)

        with self.SessionLocal() as db:
            fragments = []
            for index in range(4):
                fragment = Fragment(
                    user_id=TEST_USER_ID,
                    transcript=f"定位灵感 {index}",
                    summary="定位表达",
                    tags=json.dumps(["定位", "表达"], ensure_ascii=False),
                    source="voice",
                    sync_status="synced",
                    created_at=yesterday_start + timedelta(hours=index + 1),
                )
                db.add(fragment)
                fragments.append(fragment)
            db.commit()
            for fragment in fragments:
                db.refresh(fragment)

            match_map = {
                fragments[0].id: [
                    {"fragment_id": fragments[1].id, "score": 0.91},
                    {"fragment_id": fragments[2].id, "score": 0.88},
                ],
                fragments[1].id: [
                    {"fragment_id": fragments[0].id, "score": 0.91},
                    {"fragment_id": fragments[2].id, "score": 0.86},
                ],
                fragments[2].id: [
                    {"fragment_id": fragments[0].id, "score": 0.88},
                    {"fragment_id": fragments[1].id, "score": 0.86},
                ],
                fragments[3].id: [
                    {"fragment_id": fragments[0].id, "score": 0.41},
                ],
            }

            async def fake_query_similar_fragments(*, exclude_ids=None, **kwargs):
                fragment_id = exclude_ids[0]
                return match_map.get(fragment_id, [])

            with (
                patch.object(
                    scheduler_service,
                    "query_similar_fragments",
                    AsyncMock(side_effect=fake_query_similar_fragments),
                ),
                patch.object(
                    script_service,
                    "generate_script_content",
                    AsyncMock(return_value="昨日灵感自动成稿"),
                ),
            ):
                result = asyncio.run(
                    scheduler_service.daily_aggregate(
                        reference_time=reference_time,
                        db=db,
                    )
                )

            self.assertEqual(result["generated_scripts"], 1)
            created_script = db.query(Script).filter(Script.user_id == TEST_USER_ID).one()
            self.assertTrue(created_script.is_daily_push)
            self.assertEqual(created_script.status, "ready")
            self.assertEqual(json.loads(created_script.source_fragment_ids), [fragments[0].id, fragments[1].id, fragments[2].id])

    def test_get_daily_push_endpoint_returns_today_script(self) -> None:
        headers = self.auth_headers()
        today_start, today_end = get_local_day_bounds(datetime.fromisoformat("2026-03-06T09:00:00+00:00"))

        with self.SessionLocal() as db:
            script = Script(
                user_id=TEST_USER_ID,
                title="每日灵感推盘",
                content="今日自动成稿",
                mode="mode_a",
                source_fragment_ids=json.dumps(["f1", "f2", "f3"], ensure_ascii=False),
                status="ready",
                is_daily_push=True,
                created_at=today_start + timedelta(hours=1),
            )
            db.add(script)
            db.commit()
            db.refresh(script)

        with patch.object(script_service, "get_local_day_bounds", return_value=(today_start, today_end)):
            response = self.client.get("/api/scripts/daily-push", headers=headers)
        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertEqual(payload["id"], script.id)
        self.assertEqual(payload["source_fragment_count"], 3)

    def test_get_daily_push_endpoint_ignores_previous_days(self) -> None:
        headers = self.auth_headers()
        reference_time = datetime.fromisoformat("2026-03-06T09:00:00+00:00")
        today_start, today_end = get_local_day_bounds(reference_time, day_offset=0)
        _, yesterday_end = get_local_day_bounds(reference_time, day_offset=-1)

        with self.SessionLocal() as db:
            old_script = Script(
                user_id=TEST_USER_ID,
                title="旧的每日推盘",
                content="昨天生成的稿件",
                mode="mode_a",
                source_fragment_ids=json.dumps(["f1", "f2", "f3"], ensure_ascii=False),
                status="ready",
                is_daily_push=True,
                created_at=yesterday_end - timedelta(minutes=10),
            )
            db.add(old_script)
            db.commit()

        with patch.object(script_service, "get_local_day_bounds", return_value=(today_start, today_end)):
            response = self.client.get("/api/scripts/daily-push", headers=headers)
        self.assertEqual(response.status_code, 404)

    def test_trigger_daily_push_endpoint_generates_today_card(self) -> None:
        headers = self.auth_headers()
        reference_time = datetime.fromisoformat("2026-03-06T10:00:00+00:00")
        today_start, today_end = get_local_day_bounds(reference_time, day_offset=0)

        with self.SessionLocal() as db:
            fragments = []
            for index in range(3):
                fragment = Fragment(
                    user_id=TEST_USER_ID,
                    transcript=f"今天的定位碎片 {index}",
                    summary="定位表达",
                    tags=json.dumps(["定位", "表达"], ensure_ascii=False),
                    source="voice",
                    sync_status="synced",
                    created_at=today_start + timedelta(hours=index + 1),
                )
                db.add(fragment)
                fragments.append(fragment)
            db.commit()
            for fragment in fragments:
                db.refresh(fragment)

        match_map = {
            fragments[0].id: [
                {"fragment_id": fragments[1].id, "score": 0.9},
                {"fragment_id": fragments[2].id, "score": 0.87},
            ],
            fragments[1].id: [
                {"fragment_id": fragments[0].id, "score": 0.9},
                {"fragment_id": fragments[2].id, "score": 0.85},
            ],
            fragments[2].id: [
                {"fragment_id": fragments[0].id, "score": 0.87},
                {"fragment_id": fragments[1].id, "score": 0.85},
            ],
        }

        async def fake_query_similar_fragments(*, exclude_ids=None, **kwargs):
            fragment_id = exclude_ids[0]
            return match_map.get(fragment_id, [])

        with (
            patch.object(scheduler_service, "get_local_day_bounds", return_value=(today_start, today_end)),
            patch.object(
                scheduler_service,
                "query_similar_fragments",
                AsyncMock(side_effect=fake_query_similar_fragments),
            ),
            patch.object(
                script_service,
                "generate_script_content",
                AsyncMock(return_value="今天立即生成的灵感卡片"),
            ),
        ):
            response = self.client.post("/api/scripts/daily-push/trigger", headers=headers)

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertTrue(payload["is_daily_push"])
        self.assertEqual(payload["source_fragment_count"], 3)

    def test_force_trigger_daily_push_endpoint_skips_similarity_check(self) -> None:
        headers = self.auth_headers()
        reference_time = datetime.fromisoformat("2026-03-06T10:00:00+00:00")
        today_start, today_end = get_local_day_bounds(reference_time, day_offset=0)

        with self.SessionLocal() as db:
            for index in range(3):
                db.add(
                    Fragment(
                        user_id=TEST_USER_ID,
                        transcript=f"今天的任意碎片 {index}",
                        summary="临时灵感",
                        tags=json.dumps(["临时"], ensure_ascii=False),
                        source="voice",
                        sync_status="synced",
                        created_at=today_start + timedelta(hours=index + 1),
                    )
                )
            db.commit()

        with (
            patch.object(scheduler_service, "get_local_day_bounds", return_value=(today_start, today_end)),
            patch.object(
                script_service,
                "generate_script_content",
                AsyncMock(return_value="忽略语义关联后的今日成稿"),
            ),
        ):
            response = self.client.post("/api/scripts/daily-push/force-trigger", headers=headers)

        self.assertEqual(response.status_code, 200)
        payload = response.json()["data"]
        self.assertTrue(payload["is_daily_push"])
        self.assertEqual(payload["source_fragment_count"], 3)
