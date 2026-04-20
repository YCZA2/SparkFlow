import type { TaskExecutionScope } from '@/features/auth/taskScope';

export type TaskRecoveryKind = 'media' | 'script';

export function buildTaskRecoveryKey(
  kind: TaskRecoveryKind,
  taskRunId: string,
  scope: TaskExecutionScope
): string {
  /*按任务类型 + 完整工作区作用域拼装恢复键，避免不同会话串用同一后台 observer。 */
  return [
    kind,
    scope.userId,
    String(scope.sessionVersion ?? 'null'),
    String(scope.workspaceEpoch),
    taskRunId,
  ].join(':');
}

export function createTaskRecoveryRegistry() {
  /*维护当前会话内已启动的恢复 observer，避免前后台补跑时重复订阅同一任务。 */
  const activeKeys = new Set<string>();

  return {
    begin(key: string): boolean {
      /*首次登记返回 true；若同键已在追踪中则直接跳过。 */
      if (activeKeys.has(key)) {
        return false;
      }
      activeKeys.add(key);
      return true;
    },
    finish(key: string): void {
      /*任务进入终态或启动失败后释放占位，允许后续重新接管。 */
      activeKeys.delete(key);
    },
    has(key: string): boolean {
      /*暴露当前键是否仍在追踪，供纯状态测试校验去重语义。 */
      return activeKeys.has(key);
    },
  };
}
