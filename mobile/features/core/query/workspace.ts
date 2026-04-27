import { useMemo } from 'react';

import { useAuthStore } from '@/features/auth/authStore';
import { getWorkspaceEpoch } from '@/features/auth/workspace';

export interface WorkspaceQueryScope {
  userId: string | null;
  sessionVersion: number | null;
  workspaceEpoch: number;
}

function normalizeScopeUserId(userId: string | null): string {
  /*统一序列化用户标识，避免未登录态 query key 出现 undefined 分支。 */
  return userId ?? '__anonymous__';
}

function normalizeScopeSessionVersion(sessionVersion: number | null): string {
  /*统一序列化 session_version，保证 query key 稳定可比较。 */
  return sessionVersion === null ? '__none__' : String(sessionVersion);
}

export function getCurrentWorkspaceQueryScope(): WorkspaceQueryScope {
  /*从当前认证态与工作区 epoch 生成查询作用域，供非 React 场景复用。 */
  const state = useAuthStore.getState();
  return {
    userId: state.user?.user_id ?? null,
    sessionVersion: state.user?.session_version ?? null,
    workspaceEpoch: getWorkspaceEpoch(),
  };
}

export function useWorkspaceQueryScope(): WorkspaceQueryScope {
  /*在 React 组件里按用户、session_version 和工作区 epoch 生成稳定查询作用域。 */
  const userId = useAuthStore((state) => state.user?.user_id ?? null);
  const sessionVersion = useAuthStore((state) => state.user?.session_version ?? null);
  const workspaceEpoch = getWorkspaceEpoch();

  return useMemo(
    () => ({
      userId,
      sessionVersion,
      workspaceEpoch,
    }),
    [sessionVersion, userId, workspaceEpoch]
  );
}

export function buildWorkspaceQueryKey(
  scope: WorkspaceQueryScope,
  entity: string,
  ...parts: readonly unknown[]
) {
  /*统一组装带工作区隔离的 query key，避免不同账号和会话串缓存。 */
  return [
    'workspace',
    normalizeScopeUserId(scope.userId),
    normalizeScopeSessionVersion(scope.sessionVersion),
    scope.workspaceEpoch,
    entity,
    ...parts,
  ] as const;
}
