import { eq } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { pendingOpsTable } from '@/features/core/db/schema';

export type PendingOperationStatus = 'pending' | 'running' | 'succeeded' | 'failed';

/*把待同步动作写入 pending_ops，供重试与调试观察同步队列。 */
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
  const database = await getLocalDatabase();
  const now = new Date().toISOString();
  await database
    .insert(pendingOpsTable)
    .values({
      id: input.id,
      entityType: input.entityType,
      entityId: input.entityId,
      opType: input.opType,
      payloadJson: JSON.stringify(input.payload),
      status: input.status,
      retryCount: input.retryCount ?? 0,
      nextRetryAt: input.nextRetryAt ?? null,
      lastError: input.lastError ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pendingOpsTable.id,
      set: {
        entityType: input.entityType,
        entityId: input.entityId,
        opType: input.opType,
        payloadJson: JSON.stringify(input.payload),
        status: input.status,
        retryCount: input.retryCount ?? 0,
        nextRetryAt: input.nextRetryAt ?? null,
        lastError: input.lastError ?? null,
        updatedAt: now,
      },
    });
}

/*更新待同步动作的执行状态，避免同步过程和 UI 状态脱节。 */
export async function updatePendingOperationStatus(
  id: string,
  status: PendingOperationStatus,
  patch?: { retryCount?: number; nextRetryAt?: string | null; lastError?: string | null }
): Promise<void> {
  const database = await getLocalDatabase();
  await database
    .update(pendingOpsTable)
    .set({
      status,
      retryCount: patch?.retryCount,
      nextRetryAt: patch?.nextRetryAt ?? null,
      lastError: patch?.lastError ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(pendingOpsTable.id, id));
}

