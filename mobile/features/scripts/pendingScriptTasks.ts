import AsyncStorage from '@react-native-async-storage/async-storage';

import { sanitizeWorkspaceId } from '@/features/core/workspaceId';

export type PendingScriptTaskKind = 'manual' | 'daily_push';

export interface PendingScriptTask {
  taskRunId: string;
  kind: PendingScriptTaskKind;
  createdAt: string;
}

function buildPendingScriptTasksKey(userId: string): string {
  /*脚本任务注册表按 user_id 工作区分桶，避免不同账号共享一份待恢复列表。 */
  return `@script_tasks:${sanitizeWorkspaceId(userId)}`;
}

async function readPendingScriptTasks(userId: string): Promise<PendingScriptTask[]> {
  const raw = await AsyncStorage.getItem(buildPendingScriptTasksKey(userId));
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as Array<{ taskRunId?: string; kind?: string; createdAt?: string }>;
    if (!Array.isArray(parsed)) {
      return [];
    }
    const normalized: PendingScriptTask[] = parsed
      .map((item) => ({
        taskRunId: String(item.taskRunId ?? '').trim(),
        kind: (item.kind === 'daily_push' ? 'daily_push' : 'manual') as PendingScriptTaskKind,
        createdAt: String(item.createdAt ?? ''),
      }))
      .filter((item) => Boolean(item.taskRunId));
    return normalized;
  } catch {
    return [];
  }
}

async function writePendingScriptTasks(userId: string, tasks: PendingScriptTask[]): Promise<void> {
  await AsyncStorage.setItem(buildPendingScriptTasksKey(userId), JSON.stringify(tasks));
}

export async function listPendingScriptTasks(userId: string): Promise<PendingScriptTask[]> {
  /*返回当前工作区仍待恢复的脚本任务。 */
  return await readPendingScriptTasks(userId);
}

export async function rememberPendingScriptTask(
  userId: string,
  task: PendingScriptTask
): Promise<void> {
  /*创建脚本任务后立即登记到工作区注册表，便于切号后恢复继续追踪。 */
  const currentTasks = await readPendingScriptTasks(userId);
  const nextTasks = currentTasks.filter((item) => item.taskRunId !== task.taskRunId);
  nextTasks.push(task);
  await writePendingScriptTasks(userId, nextTasks);
}

export async function forgetPendingScriptTask(userId: string, taskRunId: string): Promise<void> {
  /*脚本任务进入终态并完成回写后，从当前工作区注册表移除。 */
  const currentTasks = await readPendingScriptTasks(userId);
  const nextTasks = currentTasks.filter((item) => item.taskRunId !== taskRunId);
  await writePendingScriptTasks(userId, nextTasks);
}
