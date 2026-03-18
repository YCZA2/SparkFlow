import AsyncStorage from '@react-native-async-storage/async-storage';
import { eq } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable, mediaAssetsTable } from '@/features/core/db/schema';
import {
  getFragmentBodyFile,
  writeFragmentBodyFile,
  writeFragmentDraftBodyFile,
} from '@/features/core/files/runtime';
import {
  extractPlainTextFromHtml,
  normalizeBodyHtml,
} from '@/features/editor/html';
import type { Fragment, LegacyLocalFragmentDraft } from '@/types/fragment';

import { useFragmentStore } from './fragmentStore';
import {
  buildLegacySnapshotRow,
  LEGACY_FRAGMENT_BODY_DRAFT_PREFIX,
  LEGACY_FRAGMENT_DETAIL_PREFIX,
  LEGACY_FRAGMENT_LIST_PREFIX,
  LEGACY_LOCAL_DRAFTS_STORAGE_KEY,
  LEGACY_MIGRATION_FLAG,
  persistBodyHtml,
  replaceLegacySnapshotMediaAssets,
} from './shared';
import { resolveLegacyDraftHtml } from './legacyMigrationUtils';

/*把旧 AsyncStorage 缓存迁入 SQLite 与文件系统，保证升级后不丢本地内容。 */
export async function migrateLegacyAsyncStorageIfNeeded(): Promise<void> {
  const migrated = await AsyncStorage.getItem(LEGACY_MIGRATION_FLAG);
  if (migrated === 'done') {
    return;
  }

  const keys = await AsyncStorage.getAllKeys();
  const removableKeys: string[] = [];

  for (const key of keys.filter((item) => item.startsWith(LEGACY_FRAGMENT_DETAIL_PREFIX))) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as { fragment?: Fragment; cachedAt?: string };
      if (parsed.fragment) {
        await upsertLegacyRemoteFragmentSnapshot(parsed.fragment, parsed.cachedAt);
        removableKeys.push(key);
      }
    } catch {
      // Ignore malformed legacy cache and continue migrating the rest.
    }
  }

  for (const key of keys.filter((item) => item.startsWith(LEGACY_FRAGMENT_LIST_PREFIX))) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as { items?: Fragment[] };
      if (Array.isArray(parsed.items)) {
        await upsertLegacyRemoteFragmentSnapshots(parsed.items);
        removableKeys.push(key);
      }
    } catch {
      // Ignore malformed legacy list cache and continue migrating the rest.
    }
  }

  for (const key of keys.filter((item) => item.startsWith(LEGACY_FRAGMENT_BODY_DRAFT_PREFIX))) {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      continue;
    }
    try {
      const fragmentId = key.slice(LEGACY_FRAGMENT_BODY_DRAFT_PREFIX.length);
      const parsed = JSON.parse(raw) as { html?: string; markdown?: string };
      const html = resolveLegacyDraftHtml(parsed);
      if (fragmentId && html) {
        await saveLegacyRemoteBodyDraft(fragmentId, html);
        removableKeys.push(key);
      }
    } catch {
      // Ignore malformed legacy body drafts and continue migrating the rest.
    }
  }

  const legacyDraftsRaw = await AsyncStorage.getItem(LEGACY_LOCAL_DRAFTS_STORAGE_KEY);
  if (legacyDraftsRaw) {
    try {
      const parsed = JSON.parse(legacyDraftsRaw) as LegacyLocalFragmentDraft[];
      if (Array.isArray(parsed)) {
        for (const legacyDraft of parsed) {
          // 兼容旧格式：local_id -> id, remote_id -> server_id
          const draftId = (legacyDraft as unknown as { local_id?: string }).local_id ?? legacyDraft.id;
          const legacyServerBindingId =
            (legacyDraft as unknown as { remote_id?: string | null }).remote_id ?? null;
          const normalizedHtml = resolveLegacyDraftHtml({ html: legacyDraft.body_html });
          await writeFragmentBodyFile(draftId, normalizedHtml);
          const database = await getLocalDatabase();
          await database
            .insert(fragmentsTable)
            .values({
              id: draftId,
              legacyServerBindingId,
              folderId: legacyDraft.folder_id ?? null,
              source: 'manual',
              audioSource: null,
              createdAt: legacyDraft.created_at,
              updatedAt: legacyDraft.created_at,
              summary: null,
              tagsJson: '[]',
              plainTextSnapshot:
                legacyDraft.plain_text_snapshot ?? extractPlainTextFromHtml(normalizedHtml),
              bodyFileUri: getFragmentBodyFile(draftId).uri,
              transcript: null,
              speakerSegmentsJson: null,
              audioFileUri: null,
              audioFileUrl: null,
              audioFileExpiresAt: null,
              legacyCloudBindingStatus: legacyServerBindingId ? 'synced' : 'pending',
              lastSyncedAt: null,
              lastSyncAttemptAt: legacyDraft.last_sync_attempt_at ?? null,
              nextRetryAt: legacyDraft.next_retry_at ?? null,
              retryCount: legacyDraft.retry_count ?? 0,
              deletedAt: null,
              contentState: normalizedHtml ? 'body_present' : 'empty',
              cachedAt: legacyDraft.created_at,
            })
            .onConflictDoNothing();

          for (const asset of legacyDraft.pending_image_assets ?? []) {
            await database
              .insert(mediaAssetsTable)
              .values({
                id: asset.local_asset_id,
                fragmentId: draftId,
                remoteAssetId: asset.remote_asset_id ?? null,
                mediaKind: 'image',
                mimeType: asset.mime_type,
                fileName: asset.file_name,
                localFileUri: asset.local_uri,
                remoteFileUrl: null,
                remoteExpiresAt: null,
                uploadStatus: asset.upload_status,
                fileSize: 0,
                checksum: null,
                width: null,
                height: null,
                durationMs: null,
                status: asset.upload_status,
                createdAt: legacyDraft.created_at,
                // 迁移时明确设置 backup 字段，不依赖 DDL 默认值以防 drizzle 插入 undefined。
                backupStatus: 'pending',
                entityVersion: 1,
                lastModifiedDeviceId: null,
              })
              .onConflictDoNothing();
          }
        }
        removableKeys.push(LEGACY_LOCAL_DRAFTS_STORAGE_KEY);
      }
    } catch {
      // Ignore malformed legacy local drafts and continue booting with new storage.
    }
  }

  await AsyncStorage.setItem(LEGACY_MIGRATION_FLAG, 'done');
  if (removableKeys.length > 0) {
    await AsyncStorage.multiRemove(removableKeys);
  }
}

/*把旧版远端正文草稿迁入文件层，供升级后恢复未同步输入。 */
async function saveLegacyRemoteBodyDraft(fragmentId: string, html: string): Promise<void> {
  const normalizedHtml = normalizeBodyHtml(html);
  await writeFragmentDraftBodyFile(fragmentId, normalizedHtml);
  const database = await getLocalDatabase();
  await database
    .update(fragmentsTable)
    .set({
      legacyCloudBindingStatus: normalizedHtml ? 'pending' : 'synced',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(fragmentsTable.id, fragmentId));
}

/*把旧版云端详情缓存迁入本地镜像，供升级迁移时复用。 */
async function upsertLegacyRemoteFragmentSnapshot(
  fragment: Fragment,
  cachedAt?: string
): Promise<void> {
  const database = await getLocalDatabase();
  const row = buildLegacySnapshotRow(fragment, cachedAt);
  await persistBodyHtml(fragment.id, fragment.body_html);
  await database
    .insert(fragmentsTable)
    .values(row)
    .onConflictDoUpdate({
      target: fragmentsTable.id,
      set: row,
    });
  await replaceLegacySnapshotMediaAssets(fragment.id, fragment.media_assets);
  useFragmentStore.getState().setDetail(fragment.id, {
    ...fragment,
    body_html: normalizeBodyHtml(fragment.body_html),
    plain_text_snapshot: String(
      fragment.plain_text_snapshot ?? extractPlainTextFromHtml(fragment.body_html)
    ),
  });
}

/*批量写入旧版云端列表缓存，避免升级后丢失可见内容。 */
async function upsertLegacyRemoteFragmentSnapshots(items: Fragment[]): Promise<void> {
  await Promise.all(items.map(async (item) => await upsertLegacyRemoteFragmentSnapshot(item)));
}
