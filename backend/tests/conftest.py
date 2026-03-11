"""pytest 公共 fixture。"""

from __future__ import annotations

import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DEFAULT_TEST_DATABASE_URL = "postgresql+psycopg://sparkflow:sparkflow@127.0.0.1:5432/sparkflow_test"

os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("DASHSCOPE_API_KEY", "test-dashscope-key")
os.environ.setdefault("DIFY_MODE_A_BASE_URL", "https://dify-mode-a.example.com/v1")
os.environ.setdefault("DIFY_MODE_A_API_KEY", "test-mode-a-key")
os.environ.setdefault("DIFY_MODE_A_WORKFLOW_ID", "wf-script-mode-a-001")
os.environ.setdefault("DIFY_MODE_B_BASE_URL", "https://dify-mode-b.example.com/v1")
os.environ.setdefault("DIFY_MODE_B_API_KEY", "test-mode-b-key")
os.environ.setdefault("DIFY_MODE_B_WORKFLOW_ID", "wf-script-mode-b-001")
os.environ.setdefault("DIFY_BASE_URL", "https://dify-daily.example.com/v1")
os.environ.setdefault("DIFY_API_KEY", "test-daily-default-key")
os.environ.setdefault("DIFY_DAILY_PUSH_API_KEY", "test-daily-push-key")
os.environ.setdefault("DIFY_DAILY_PUSH_WORKFLOW_ID", "wf-daily-push-001")
os.environ.setdefault("DIFY_POLL_INTERVAL_SECONDS", "0")
os.environ.setdefault("DIFY_POLL_TIMEOUT_SECONDS", "1")
os.environ.setdefault("DATABASE_URL", os.environ.get("TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL))

from main import create_app
from models import Base, User
from modules.auth.application import TEST_USER_ID
from modules.shared.infrastructure import LocalFileStorage
from tests.support import (
    FakeExternalMediaProvider,
    FakeLLMProvider,
    FakeSTTProvider,
    FakeVectorStore,
    FakeWebSearchProvider,
    FakeWorkflowProvider,
)


@pytest.fixture(scope="session")
def test_database_url() -> str:
    """返回测试数据库连接串，并强制要求 PostgreSQL。"""
    database_url = os.environ.get("TEST_DATABASE_URL") or os.environ["DATABASE_URL"]
    if not database_url.startswith("postgresql"):
        raise RuntimeError("测试数据库必须使用 PostgreSQL 连接串")
    return database_url


@pytest.fixture(scope="session")
def test_engine(test_database_url: str):
    """创建跨测试复用的 PostgreSQL 引擎。"""
    engine = create_engine(test_database_url, future=True, pool_pre_ping=True)
    yield engine
    engine.dispose()


@pytest.fixture
def db_session_factory(test_engine):
    """为每个测试重建表结构并返回新的 Session 工厂。"""
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    with session_factory() as session:
        # 为鉴权链路和默认业务测试预置测试用户，避免 PostgreSQL 外键约束失败。
        session.add(User(id=TEST_USER_ID, role="user", nickname="测试用户"))
        session.commit()
    yield session_factory
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def vector_store() -> FakeVectorStore:
    """提供默认的内存向量库替身。"""
    return FakeVectorStore()


@pytest.fixture
def external_media_provider() -> FakeExternalMediaProvider:
    """提供默认的外部媒体 provider 替身。"""
    return FakeExternalMediaProvider()


@pytest.fixture
def web_search_provider() -> FakeWebSearchProvider:
    """提供默认的 Web 搜索 provider 替身。"""
    return FakeWebSearchProvider()


@pytest.fixture
def llm_provider() -> FakeLLMProvider:
    """提供默认可成功返回文案的 LLM 替身。"""
    return FakeLLMProvider()


@pytest.fixture
def stt_provider() -> FakeSTTProvider:
    """提供默认可成功返回转写文本的 STT 替身。"""
    return FakeSTTProvider()


@pytest.fixture
def script_mode_a_workflow_provider() -> FakeWorkflowProvider:
    """提供 mode_a 脚本工作流 provider 替身。"""
    provider = FakeWorkflowProvider()
    provider.provider_workflow_id = "wf-script-mode-a-001"
    provider.queue_success(draft="生成后的口播稿")
    return provider


@pytest.fixture
def script_mode_b_workflow_provider() -> FakeWorkflowProvider:
    """提供 mode_b 脚本工作流 provider 替身。"""
    provider = FakeWorkflowProvider()
    provider.provider_workflow_id = "wf-script-mode-b-001"
    provider.provider_run_id = "provider-run-mode-b"
    provider.provider_task_id = "task-mode-b"
    provider.poll_provider_task_id = "task-mode-b"
    provider.queue_success(draft="生成后的口播稿")
    return provider


@pytest.fixture
def daily_push_workflow_provider() -> FakeWorkflowProvider:
    """提供每日推盘专用的 workflow provider 替身。"""
    provider = FakeWorkflowProvider()
    provider.queue_success(draft="生成后的口播稿")
    return provider


@pytest_asyncio.fixture
async def app(
    db_session_factory,
    tmp_path,
    vector_store,
    external_media_provider,
    web_search_provider,
    llm_provider,
    stt_provider,
    script_mode_a_workflow_provider,
    script_mode_b_workflow_provider,
    daily_push_workflow_provider,
):
    """创建挂载测试依赖的 FastAPI 应用。"""
    test_app = create_app()
    test_app.state.container.session_factory = db_session_factory
    test_app.state.container.file_storage = LocalFileStorage(str(tmp_path))
    test_app.state.container.vector_store = vector_store
    test_app.state.container.external_media_provider = external_media_provider
    test_app.state.container.web_search_provider = web_search_provider
    test_app.state.container.llm_provider = llm_provider
    test_app.state.container.stt_provider = stt_provider
    test_app.state.container.script_mode_a_workflow_provider = script_mode_a_workflow_provider
    test_app.state.container.script_mode_b_workflow_provider = script_mode_b_workflow_provider
    test_app.state.container.daily_push_workflow_provider = daily_push_workflow_provider
    yield test_app
    test_app.state.scheduler_service.stop()
    if test_app.state.container.pipeline_dispatcher:
        await test_app.state.container.pipeline_dispatcher.stop()
    await test_app.state.container.script_mode_a_workflow_provider.aclose()
    await test_app.state.container.script_mode_b_workflow_provider.aclose()
    await test_app.state.container.daily_push_workflow_provider.aclose()


@pytest_asyncio.fixture
async def stateless_app():
    """创建关闭启动副作用的 FastAPI 应用。"""
    test_app = create_app(enable_runtime_side_effects=False)
    yield test_app
    test_app.state.scheduler_service.stop()
    if test_app.state.container.pipeline_dispatcher:
        await test_app.state.container.pipeline_dispatcher.stop()
    await test_app.state.container.script_mode_a_workflow_provider.aclose()
    await test_app.state.container.script_mode_b_workflow_provider.aclose()
    await test_app.state.container.daily_push_workflow_provider.aclose()


@pytest_asyncio.fixture
async def async_client(app):
    """提供基于 ASGITransport 的异步测试客户端。"""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as client:
        yield client


@pytest_asyncio.fixture
async def stateless_client(stateless_app):
    """提供用于无数据库 smoke 的异步测试客户端。"""
    async with AsyncClient(transport=ASGITransport(app=stateless_app), base_url="http://testserver") as client:
        yield client


@pytest.fixture
def auth_headers_factory():
    """提供创建鉴权请求头的异步助手。"""
    async def _build(client: AsyncClient) -> dict[str, str]:
        response = await client.post("/api/auth/token", json={})
        assert response.status_code == 200
        token = response.json()["data"]["access_token"]
        return {"Authorization": f"Bearer {token}"}

    return _build
