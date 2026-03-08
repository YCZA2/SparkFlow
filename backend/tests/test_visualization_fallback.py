import unittest
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from domains.fragments import repository as fragment_repository
from models import Base
from modules.fragments.visualization import build_fragment_visualization


class _FakeVectorStore:
    def __init__(self):
        self._docs = []

    async def list_fragment_documents(self, *, user_id: str, include_embeddings: bool = True):
        return self._docs

    async def upsert_fragment(self, **kwargs):
        return True


class VisualizationFallbackTestCase(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        Base.metadata.create_all(bind=self.engine)

    async def asyncTearDown(self) -> None:
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    async def test_falls_back_to_text_features_when_vector_store_has_no_embeddings(self) -> None:
        with self.SessionLocal() as db:
            fragment = fragment_repository.create(
                db=db,
                user_id="test-user-001",
                transcript="这是一个关于定位方法的碎片",
                source="manual",
                audio_source=None,
                audio_path=None,
                sync_status="synced",
            )

            store = _FakeVectorStore()
            payload = await build_fragment_visualization(
                db=db,
                user_id="test-user-001",
                vector_store=store,
            )

            self.assertEqual(payload["meta"]["used_vector_source"], "fallback_text_features")
            self.assertEqual(payload["stats"]["total_fragments"], 1)
            self.assertEqual(payload["points"][0]["id"], fragment.id)

    async def test_uses_vector_store_when_embeddings_exist(self) -> None:
        with self.SessionLocal() as db:
            fragment = fragment_repository.create(
                db=db,
                user_id="test-user-001",
                transcript="这是另一个碎片",
                source="manual",
                audio_source=None,
                audio_path=None,
                sync_status="synced",
            )

            store = _FakeVectorStore()
            store._docs = [SimpleNamespace(id=fragment.id, embedding=[0.1, 0.2, 0.3])]

            payload = await build_fragment_visualization(
                db=db,
                user_id="test-user-001",
                vector_store=store,
            )

            self.assertEqual(payload["meta"]["used_vector_source"], "vector_store")
            self.assertEqual(payload["stats"]["total_fragments"], 1)


if __name__ == "__main__":
    unittest.main()
