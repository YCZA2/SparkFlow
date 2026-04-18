from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core import ResponseModel, success_response
from core.auth import get_current_user
from modules.shared.infrastructure.container import ServiceContainer, get_container, get_db_session

from .application import TaskQueryService, map_task_run
from .schemas import RetryTaskRequest, TaskRunResponse, TaskStepListResponse

router = APIRouter(prefix="/api/tasks", tags=["tasks"], responses={401: {"description": "未认证"}})


@router.get(
    "/{task_id}",
    response_model=ResponseModel[TaskRunResponse],
    summary="获取任务详情",
    description="返回统一异步任务的整体状态、关联资源和最终输出。",
)
async def get_task_run(
    task_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    run = TaskQueryService().get_run(db=db, user_id=current_user["user_id"], run_id=task_id)
    return success_response(data=map_task_run(run))


@router.get(
    "/{task_id}/steps",
    response_model=ResponseModel[TaskStepListResponse],
    summary="获取任务步骤列表",
    description="按步骤顺序返回当前后台任务每个节点的执行状态。",
)
async def list_task_steps(
    task_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db_session),
):
    payload = TaskQueryService().list_steps(db=db, user_id=current_user["user_id"], run_id=task_id)
    return success_response(data=payload)


@router.post(
    "/{task_id}/retry",
    response_model=ResponseModel[TaskRunResponse],
    summary="重跑失败任务",
    description="支持从失败步骤续跑，或从头重跑整条后台链路。",
)
async def retry_task_run(
    task_id: str,
    data: RetryTaskRequest,
    current_user: dict = Depends(get_current_user),
    container: ServiceContainer = Depends(get_container),
):
    run = await container.task_recovery_service.retry_run(
        user_id=current_user["user_id"],
        run_id=task_id,
        strategy=data.strategy,
    )
    return success_response(data=map_task_run(run), message="任务已重新入队")
