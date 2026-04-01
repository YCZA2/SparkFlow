import AsyncStorage from '@react-native-async-storage/async-storage';

import { sanitizeWorkspaceId } from '@/features/core/workspaceId';

export type PendingScriptTaskKind = 'manual' | 'daily_push';

export interface PendingScriptPipelineTask {
  pipelineRunId: string;
  kind: PendingScriptTaskKind;
  createdAt: string;
}

function buildPendingScriptTasksKey(userId: string): string {
  /*脚本任务注册表按 user_id 工作区分桶，避免不同账号共享一份待恢复列表。 */
  return `@script_pipeline_tasks:${sanitizeWorkspaceId(userId)}`;
}

async function readPendingScriptTasks(userId: string): Promise<PendingScriptPipelineTask[]> {
  const raw = await AsyncStorage.getItem(buildPendingScriptTasksKey(userId));
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as PendingScriptPipelineTask[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePendingScriptTasks(userId: string, tasks: PendingScriptPipelineTask[]): Promise<void> {
  await AsyncStorage.setItem(buildPendingScriptTasksKey(userId), JSON.stringify(tasks));
}

export async function listPendingScriptPipelineTasks(userId: string): Promise<PendingScriptPipelineTask[]> {
  /*返回当前工作区仍待恢复的脚本 pipeline 任务。 */
  return await readPendingScriptTasks(userId);
}

export async function rememberPendingScriptPipelineTask(
  userId: string,
  task: PendingScriptPipelineTask
): Promise<void> {
  /*创建脚本任务后立即登记到工作区注册表，便于切号后恢复继续追踪。 */
  const currentTasks = await readPendingScriptTasks(userId);
  const nextTasks = currentTasks.filter((item) => item.pipelineRunId !== task.pipelineRunId);
  nextTasks.push(task);
  await writePendingScriptTasks(userId, nextTasks);
}

export async function forgetPendingScriptPipelineTask(userId: string, pipelineRunId: string): Promise<void> {
  /*脚本任务进入终态并完成回写后，从当前工作区注册表移除。 */
  const currentTasks = await readPendingScriptTasks(userId);
  const nextTasks = currentTasks.filter((item) => item.pipelineRunId !== pipelineRunId);
  await writePendingScriptTasks(userId, nextTasks);
}
