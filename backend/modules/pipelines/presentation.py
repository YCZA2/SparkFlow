from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.infrastructure.container import get_container, get_db_session, ServiceContainer

from .application import PipelineQueryService, map_pipeline_run
from .schemas import PipelineRunResponse, PipelineStepListResponse, RetryPipelineRequest

router = APIRouter(prefix="/api/pipelines", tags=["pipelines"], responses={401: {"description": "未认证"}})


@router.get(
    "/{run_id}",
    response_model=ResponseModel[PipelineRunResponse],
    summary="获取流水线详情（legacy）",
    description="deprecated：优先使用 /api/tasks/{task_id}；该接口保留兼容查询能力。",
)
async def get_pipeline_run(
    run_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    run = PipelineQueryService().get_run(db=db, user_id=current_user["user_id"], run_id=run_id)
    return success_response(data=map_pipeline_run(run))


@router.get(
    "/{run_id}/steps",
    response_model=ResponseModel[PipelineStepListResponse],
    summary="获取流水线步骤列表（legacy）",
    description="deprecated：优先使用 /api/tasks/{task_id}/steps；该接口保留兼容查询能力。",
)
async def list_pipeline_steps(
    run_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    payload = PipelineQueryService().list_steps(db=db, user_id=current_user["user_id"], run_id=run_id)
    return success_response(data=payload)


@router.post(
    "/{run_id}/retry",
    response_model=ResponseModel[PipelineRunResponse],
    summary="重跑失败流水线（legacy）",
    description="deprecated：优先使用 /api/tasks/{task_id}/retry；该接口当前会转发到新任务重试能力。",
)
async def retry_pipeline_run(
    run_id: str,
    data: RetryPipelineRequest,
    current_user: dict = Depends(get_current_user),
    container: ServiceContainer = Depends(get_container),
):
    run = await container.task_recovery_service.retry_run(
        user_id=current_user["user_id"],
        run_id=run_id,
        strategy=data.strategy,
    )
    return success_response(data=map_pipeline_run(run), message="流水线已重新入队")
