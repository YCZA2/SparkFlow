import { useAuthStore } from '@/features/auth/authStore';
import { getWorkspaceEpoch } from '@/features/auth/workspace';

export interface TaskExecutionScope {
  userId: string;
  sessionVersion: number | null;
  workspaceEpoch: number;
}

export class TaskScopeMismatchError extends Error {
  constructor(message = '当前账号工作区已切换，旧任务回写已停止') {
    super(message);
    this.name = 'TaskScopeMismatchError';
  }
}

export function captureTaskExecutionScope(): TaskExecutionScope | null {
  /*在任务发起瞬间捕获账号、session_version 和工作区 epoch。 */
  const state = useAuthStore.getState();
  const userId = state.user?.user_id;
  if (!state.isAuthenticated || !userId) {
    return null;
  }
  return {
    userId,
    sessionVersion: state.user?.session_version ?? null,
    workspaceEpoch: getWorkspaceEpoch(),
  };
}

export function captureRequiredTaskExecutionScope(): TaskExecutionScope {
  /*需要远端能力的任务必须绑定一个有效作用域，缺失时直接阻断继续执行。 */
  const scope = captureTaskExecutionScope();
  if (!scope) {
    raiseTaskScopeMismatch('当前未挂载有效账号工作区，无法继续执行任务');
  }
  return scope;
}

export function isTaskScopeActive(scope: TaskExecutionScope | null | undefined): boolean {
  /*通过用户、session_version 和工作区 epoch 三重条件判断任务是否仍可回写。 */
  if (!scope) {
    return false;
  }
  const state = useAuthStore.getState();
  return (
    state.isAuthenticated &&
    state.user?.user_id === scope.userId &&
    (state.user?.session_version ?? null) === scope.sessionVersion &&
    getWorkspaceEpoch() === scope.workspaceEpoch
  );
}

export function assertTaskScopeActive(
  scope: TaskExecutionScope | null | undefined,
  message?: string
): void {
  /*回写本地 UI、SQLite 或文件前统一校验作用域，防止旧账号任务串线。 */
  if (!isTaskScopeActive(scope)) {
    raiseTaskScopeMismatch(message);
  }
}

function raiseTaskScopeMismatch(message?: string): never {
  throw new TaskScopeMismatchError(message);
}
