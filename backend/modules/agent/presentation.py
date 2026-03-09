from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.container import ServiceContainer, get_container, get_db_session

from .application import AgentRunQueryService, ScriptResearchRunUseCase, ScriptWorkflowUseCase, map_agent_run
from .dify_client import DifyClient
from .schemas import AgentRunDetail, ScriptResearchRunCreateRequest

router = APIRouter(prefix="/api/agent", tags=["agent"], responses={401: {"description": "未认证"}})


def get_dify_client(container: ServiceContainer = Depends(get_container)) -> DifyClient:
    from core.config import settings

    return DifyClient(
        base_url=settings.DIFY_BASE_URL,
        api_key=settings.DIFY_API_KEY,
        http_client=container.dify_http_client,
    )


def get_script_research_use_case(
    container: ServiceContainer = Depends(get_container),
    dify_client: DifyClient = Depends(get_dify_client),
) -> ScriptResearchRunUseCase:
    """构建研究型脚本工作流用例。"""
    return ScriptResearchRunUseCase(
        dify_client=dify_client,
        vector_store=container.vector_store,
        web_search_provider=container.web_search_provider,
    )


def get_script_workflow_use_case(
    container: ServiceContainer = Depends(get_container),
    dify_client: DifyClient = Depends(get_dify_client),
) -> ScriptWorkflowUseCase:
    """构建统一脚本生成工作流用例。"""
    return ScriptWorkflowUseCase(
        dify_client=dify_client,
        vector_store=container.vector_store,
        web_search_provider=container.web_search_provider,
    )


@router.post(
    "/script-research-runs",
    status_code=status.HTTP_201_CREATED,
    response_model=ResponseModel[AgentRunDetail],
    summary="创建脚本研究工作流运行",
    description="基于选中的碎片与知识上下文，向 Dify 发起一次外挂脚本研究工作流。",
)
async def create_script_research_run(
    data: ScriptResearchRunCreateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: ScriptResearchRunUseCase = Depends(get_script_research_use_case),
):
    run = await use_case.create_run(
        db=db,
        user_id=current_user["user_id"],
        fragment_ids=data.fragment_ids,
        mode=data.mode,
        query_hint=data.query_hint,
        include_web_search=data.include_web_search,
    )
    return success_response(data=map_agent_run(run), message="脚本研究任务已创建")


@router.get(
    "/runs/{run_id}",
    response_model=ResponseModel[AgentRunDetail],
    summary="获取工作流运行详情",
    description="返回当前用户的外挂工作流运行状态。",
)
async def get_agent_run(
    run_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    run = AgentRunQueryService().get_run(db=db, user_id=current_user["user_id"], run_id=run_id)
    return success_response(data=map_agent_run(run))


@router.post(
    "/runs/{run_id}/refresh",
    response_model=ResponseModel[AgentRunDetail],
    summary="刷新工作流运行状态",
    description="主动向 Dify 查询最新执行状态，并在成功后创建本地口播稿。",
)
async def refresh_agent_run(
    run_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
    use_case: ScriptResearchRunUseCase = Depends(get_script_research_use_case),
):
    run = await use_case.refresh_run(db=db, user_id=current_user["user_id"], run_id=run_id)
    return success_response(data=map_agent_run(run))
