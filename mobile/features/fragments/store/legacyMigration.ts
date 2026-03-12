import AsyncStorage from '@react-native-async-storage/async-storage';

import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable, mediaAssetsTable } from '@/features/core/db/schema';
import { getFragmentBodyFile, writeFragmentBodyFile } from '@/features/core/files/runtime';
import { extractPlainTextFromHtml } from '@/features/editor/html';
import type { Fragment, LocalFragmentDraft } from '@/types/fragment';

import { saveRemoteBodyDraft } from './remoteBodyDrafts';
import {
  upsertRemoteFragmentSnapshot,
  upsertRemoteFragmentSnapshots,
} from './remoteFragments';
import {
  LEGACY_FRAGMENT_BODY_DRAFT_PREFIX,
  LEGACY_FRAGMENT_DETAIL_PREFIX,
  LEGACY_FRAGMENT_LIST_PREFIX,
  LEGACY_LOCAL_DRAFTS_STORAGE_KEY,
  LEGACY_MIGRATION_FLAG,
} from './shared';
import { resolveLegacyDraftHtml } from './legacyMigrationState';

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
        await upsertRemoteFragmentSnapshot(parsed.fragment, parsed.cachedAt);
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
        await upsertRemoteFragmentSnapshots(parsed.items);
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
        await saveRemoteBodyDraft(fragmentId, html);
        removableKeys.push(key);
      }
    } catch {
      // Ignore malformed legacy body drafts and continue migrating the rest.
    }
  }

  const legacyDraftsRaw = await AsyncStorage.getItem(LEGACY_LOCAL_DRAFTS_STORAGE_KEY);
  if (legacyDraftsRaw) {
    try {
      const parsed = JSON.parse(legacyDraftsRaw) as LocalFragmentDraft[];
      if (Array.isArray(parsed)) {
        for (const legacyDraft of parsed) {
          const normalizedHtml = resolveLegacyDraftHtml({ html: legacyDraft.body_html });
          await writeFragmentBodyFile(legacyDraft.local_id, normalizedHtml);
          const database = await getLocalDatabase();
          await database
            .insert(fragmentsTable)
            .values({
              id: legacyDraft.local_id,
              remoteId: legacyDraft.remote_id ?? null,
              folderId: legacyDraft.folder_id ?? null,
              source: 'manual',
              audioSource: null,
              createdAt: legacyDraft.created_at,
              updatedAt: legacyDraft.created_at,
              summary: null,
              tagsJson: '[]',
              plainTextSnapshot:
                legacyDraft.plain_text_snapshot ?? extractPlainTextFromHtml(normalizedHtml),
              bodyFileUri: getFragmentBodyFile(legacyDraft.local_id).uri,
              transcript: null,
              speakerSegmentsJson: null,
              audioFileUri: null,
              audioFileUrl: null,
              audioFileExpiresAt: null,
              syncStatus: 'local_only',
              remoteSyncState: 'idle',
              lastSyncedAt: null,
              lastRemoteVersion: null,
              lastSyncAttemptAt: legacyDraft.last_sync_attempt_at ?? null,
              nextRetryAt: legacyDraft.next_retry_at ?? null,
              retryCount: legacyDraft.retry_count ?? 0,
              deletedAt: null,
              isLocalDraft: 1,
              localSyncStatus: legacyDraft.sync_status,
              displaySourceLabel: '本地草稿',
              contentState: normalizedHtml ? 'body_present' : 'empty',
              cachedAt: legacyDraft.created_at,
            })
            .onConflictDoNothing();

          for (const asset of legacyDraft.pending_image_assets ?? []) {
            await database
              .insert(mediaAssetsTable)
              .values({
                id: asset.local_asset_id,
                fragmentId: legacyDraft.local_id,
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
