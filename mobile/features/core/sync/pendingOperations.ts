import {
  updatePendingOperationStatus as updateMirrorPendingOperationStatus,
  upsertPendingOperation as upsertMirrorPendingOperation,
} from '@/features/fragments/store/localMirror';

export type PendingOperationStatus = 'pending' | 'running' | 'succeeded' | 'failed';

/*统一暴露 pending_ops 写入入口，避免业务模块直接耦合底层镜像表结构。 */
export async function upsertPendingOperation(input: {
  id: string;
  entityType: string;
  entityId: string;
  opType: string;
  payload: Record<string, unknown>;
  status: PendingOperationStatus;
  retryCount?: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
}): Promise<void> {
  await upsertMirrorPendingOperation(input);
}

/*统一暴露 pending_ops 状态更新入口，供同步队列记录重试与终态。 */
export async function updatePendingOperationStatus(
  id: string,
  status: PendingOperationStatus,
  patch?: { retryCount?: number; nextRetryAt?: string | null; lastError?: string | null }
): Promise<void> {
  await updateMirrorPendingOperationStatus(id, status, patch);
}

