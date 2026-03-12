import AsyncStorage from '@react-native-async-storage/async-storage';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable, mediaAssetsTable, pendingOpsTable } from '@/features/core/db/schema';
import {
  clearFragmentDraftBodyFile,
  deleteFileIfExists,
  getFragmentBodyFile,
  getFragmentMetaPath,
  listFragmentDraftBodyIds,
  prepareManagedImageFile,
  readFragmentBodyFile,
  readFragmentDraftBodyFile,
  writeFragmentBodyFile,
  writeFragmentDraftBodyFile,
  ensureFileRuntimeReady,
} from '@/features/core/files/runtime';
import { extractPlainTextFromHtml, normalizeBodyHtml } from '@/features/fragments/bodyMarkdown';
import { normalizeFragmentTags } from '@/features/fragments/utils';
import type {
  Fragment,
  LocalFragmentDraft,
  LocalFragmentSyncStatus,
  LocalPendingImageAsset,
  MediaAsset,
} from '@/types/fragment';

const LEGACY_FRAGMENT_DETAIL_PREFIX = '@fragment_cache:v1:detail:';
const LEGACY_FRAGMENT_LIST_PREFIX = '@fragment_cache:v1:list:';
const LEGACY_FRAGMENT_BODY_DRAFT_PREFIX = '@fragment_body_html_draft:';
const LEGACY_LOCAL_DRAFTS_STORAGE_KEY = '@local_fragment_drafts:v1';
const LEGACY_MIGRATION_FLAG = '@local_fragment_mirror_migrated:v1';
const LOCAL_FRAGMENT_ID_PREFIX = 'local:fragment:';
const LOCAL_IMAGE_ASSET_ID_PREFIX = 'local:image:';

type FragmentRow = typeof fragmentsTable.$inferSelect;
type MediaAssetRow = typeof mediaAssetsTable.$inferSelect;

const detailMemoryCache = new Map<string, Fragment>();
const listeners = new Set<() => void>();
let migrationPromise: Promise<void> | null = null;

/*为本地草稿生成稳定的本地主键，避免真机多次重启后冲突。 */
function generateLocalId(prefix: string): string {
  return `${prefix}${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

/*把标签统一序列化为 JSON 文本，便于 SQLite 持久化。 */
function serializeTags(tags: string[] | null | undefined): string {
  return JSON.stringify(normalizeFragmentTags(tags));
}

/*从 SQLite 记录中恢复标签数组，避免旧数据结构污染 UI。 */
function deserializeTags(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }
  try {
    return normalizeFragmentTags(JSON.parse(raw));
  } catch {
    return normalizeFragmentTags(raw);
  }
}

/*把 speaker segments 收敛成 JSON，保证本地镜像结构稳定。 */
function serializeSpeakerSegments(segments: Fragment['speaker_segments']): string | null {
  if (!segments) {
    return null;
  }
  return JSON.stringify(segments);
}

/*把 speaker segments JSON 还原为页面消费的数组结构。 */
function deserializeSpeakerSegments(raw: string | null | undefined): Fragment['speaker_segments'] {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/*统一发送本地镜像变化通知，让列表和详情在写入后及时刷新。 */
function emitMirrorChange(): void {
  listeners.forEach((listener) => listener());
}

/*按 SQLite 行还原媒体资源，供详情与编辑器直接消费。 */
function mapMediaAssetRow(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    media_kind: row.mediaKind as MediaAsset['media_kind'],
    original_filename: row.fileName,
    mime_type: row.mimeType,
    file_size: row.fileSize,
    checksum: row.checksum,
    width: row.width,
    height: row.height,
    duration_ms: row.durationMs,
    status: row.status,
    created_at: row.createdAt,
    file_url: row.localFileUri ?? row.remoteFileUrl,
    expires_at: row.remoteExpiresAt,
  };
}

/*按本地镜像行与正文文件组装远端碎片展示模型。 */
async function mapRemoteRowToFragment(row: FragmentRow, mediaRows: MediaAssetRow[]): Promise<Fragment> {
  const bodyHtml = normalizeBodyHtml(await readFragmentBodyFile(row.id));
  return {
    id: row.id,
    remote_id: row.remoteId ?? row.id,
    is_local_draft: false,
    local_sync_status: null,
    display_source_label: row.displaySourceLabel ?? null,
    audio_file_url: row.audioFileUrl,
    audio_file_expires_at: row.audioFileExpiresAt ?? undefined,
    transcript: row.transcript,
    speaker_segments: deserializeSpeakerSegments(row.speakerSegmentsJson),
    summary: row.summary,
    tags: deserializeTags(row.tagsJson),
    source: row.source as Fragment['source'],
    audio_source: (row.audioSource as Fragment['audio_source']) ?? null,
    created_at: row.createdAt,
    folder_id: row.folderId ?? null,
    folder: null,
    body_html: bodyHtml,
    plain_text_snapshot: row.plainTextSnapshot,
    content_state: (row.contentState as Fragment['content_state']) ?? (bodyHtml ? 'body_present' : 'empty'),
    media_assets: mediaRows.map(mapMediaAssetRow),
  };
}

/*按本地镜像行与待上传素材组装 local draft 记录。 */
async function mapLocalDraftRow(row: FragmentRow, mediaRows: MediaAssetRow[]): Promise<LocalFragmentDraft> {
  const bodyHtml = normalizeBodyHtml(await readFragmentBodyFile(row.id));
  return {
    local_id: row.id,
    remote_id: row.remoteId ?? null,
    folder_id: row.folderId ?? null,
    body_html: bodyHtml,
    plain_text_snapshot: row.plainTextSnapshot || extractPlainTextFromHtml(bodyHtml),
    created_at: row.createdAt,
    sync_status: (row.localSyncStatus as LocalFragmentSyncStatus) ?? 'creating',
    last_sync_attempt_at: row.lastSyncAttemptAt ?? null,
    next_retry_at: row.nextRetryAt ?? null,
    retry_count: row.retryCount ?? 0,
    pending_image_assets: mediaRows.map((asset) => ({
      local_asset_id: asset.id,
      local_fragment_id: row.id,
      local_uri: asset.localFileUri ?? asset.remoteFileUrl ?? '',
      mime_type: asset.mimeType,
      file_name: asset.fileName,
      remote_asset_id: asset.remoteAssetId ?? null,
      upload_status: asset.uploadStatus as LocalPendingImageAsset['upload_status'],
    })),
  };
}

/*把远端 DTO 映射为 fragments 行，供本地镜像统一 upsert。 */
function buildRemoteFragmentRow(fragment: Fragment, cachedAt?: string): typeof fragmentsTable.$inferInsert {
  const now = new Date().toISOString();
  return {
    id: fragment.id,
    remoteId: fragment.id,
    folderId: fragment.folder_id ?? null,
    source: fragment.source,
    audioSource: fragment.audio_source ?? null,
    createdAt: fragment.created_at,
    updatedAt: fragment.created_at,
    summary: fragment.summary ?? null,
    tagsJson: serializeTags(fragment.tags),
    plainTextSnapshot: String(fragment.plain_text_snapshot ?? extractPlainTextFromHtml(fragment.body_html)),
    bodyFileUri: getFragmentBodyFile(fragment.id).uri,
    transcript: fragment.transcript ?? null,
    speakerSegmentsJson: serializeSpeakerSegments(fragment.speaker_segments),
    audioFileUri: fragment.audio_file_url ?? null,
    audioFileUrl: fragment.audio_file_url ?? null,
    audioFileExpiresAt: fragment.audio_file_expires_at ?? null,
    syncStatus: 'synced',
    remoteSyncState: 'synced',
    lastSyncedAt: now,
    lastRemoteVersion: null,
    lastSyncAttemptAt: null,
    nextRetryAt: null,
    retryCount: 0,
    deletedAt: null,
    isLocalDraft: 0,
    localSyncStatus: null,
    displaySourceLabel: fragment.display_source_label ?? null,
    contentState: fragment.content_state ?? null,
    cachedAt: cachedAt ?? now,
  };
}

/*把 LocalFragmentDraft patch 映射为 fragments 表更新字段。 */
function buildLocalDraftRowPatch(
  current: FragmentRow,
  patch: Partial<LocalFragmentDraft>
): Partial<typeof fragmentsTable.$inferInsert> {
  return {
    remoteId: patch.remote_id === undefined ? current.remoteId : patch.remote_id,
    folderId: patch.folder_id === undefined ? current.folderId : patch.folder_id,
    updatedAt: new Date().toISOString(),
    plainTextSnapshot:
      typeof patch.plain_text_snapshot === 'string'
        ? patch.plain_text_snapshot
        : current.plainTextSnapshot,
    localSyncStatus:
      patch.sync_status === undefined ? current.localSyncStatus : patch.sync_status,
    lastSyncAttemptAt:
      patch.last_sync_attempt_at === undefined ? current.lastSyncAttemptAt : patch.last_sync_attempt_at,
    nextRetryAt:
      patch.next_retry_at === undefined ? current.nextRetryAt : patch.next_retry_at,
    retryCount:
      patch.retry_count === undefined ? current.retryCount : patch.retry_count,
  };
}

/*按 fragment_id 批量读取素材行，避免列表和详情多次往返数据库。 */
async function loadMediaRowsByFragmentIds(fragmentIds: string[]): Promise<Map<string, MediaAssetRow[]>> {
  const map = new Map<string, MediaAssetRow[]>();
  if (fragmentIds.length === 0) {
    return map;
  }
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(mediaAssetsTable)
    .where(inArray(mediaAssetsTable.fragmentId, fragmentIds));
  for (const row of rows) {
    const bucket = map.get(row.fragmentId) ?? [];
    bucket.push(row);
    map.set(row.fragmentId, bucket);
  }
  return map;
}

/*按 id 或 remote_id 查询单条 fragments 行，供绑定远端 id 等场景复用。 */
async function loadFragmentRowByIdOrRemoteId(identifier: string): Promise<FragmentRow | null> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(or(eq(fragmentsTable.id, identifier), eq(fragmentsTable.remoteId, identifier)))
    .limit(1);
  return rows[0] ?? null;
}

/*用远端素材列表替换远端镜像下的媒体资源，同时保留独立本地草稿的待上传项。 */
async function replaceRemoteMediaAssets(fragmentId: string, mediaAssets: MediaAsset[] | undefined): Promise<void> {
  const database = await getLocalDatabase();
  const nextAssets = mediaAssets ?? [];
  const keepIds = new Set(nextAssets.map((asset) => asset.id));
  const existingRows = await database
    .select()
    .from(mediaAssetsTable)
    .where(eq(mediaAssetsTable.fragmentId, fragmentId));

  await Promise.all(
    existingRows
      .filter((row) => !keepIds.has(row.id))
      .map((row) => database.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, row.id)))
  );

  for (const asset of nextAssets) {
    await database
      .insert(mediaAssetsTable)
      .values({
        id: asset.id,
        fragmentId,
        remoteAssetId: asset.id,
        mediaKind: asset.media_kind,
        mimeType: asset.mime_type,
        fileName: asset.original_filename,
        localFileUri: null,
        remoteFileUrl: asset.file_url ?? null,
        remoteExpiresAt: asset.expires_at ?? null,
        uploadStatus: asset.status ?? 'uploaded',
        fileSize: asset.file_size ?? 0,
        checksum: asset.checksum ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
        durationMs: asset.duration_ms ?? null,
        status: asset.status ?? 'uploaded',
        createdAt: asset.created_at ?? new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: mediaAssetsTable.id,
        set: {
          fragmentId,
          remoteAssetId: asset.id,
          mediaKind: asset.media_kind,
          mimeType: asset.mime_type,
          fileName: asset.original_filename,
          localFileUri: null,
          remoteFileUrl: asset.file_url ?? null,
          remoteExpiresAt: asset.expires_at ?? null,
          uploadStatus: asset.status ?? 'uploaded',
          fileSize: asset.file_size ?? 0,
          checksum: asset.checksum ?? null,
          width: asset.width ?? null,
          height: asset.height ?? null,
          durationMs: asset.duration_ms ?? null,
          status: asset.status ?? 'uploaded',
          createdAt: asset.created_at ?? new Date().toISOString(),
        },
      });
  }
}

/*把待同步动作写入 pending_ops，供重试与调试观察同步队列。 */
export async function upsertPendingOperation(input: {
  id: string;
  entityType: string;
  entityId: string;
  opType: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
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
  status: 'pending' | 'running' | 'succeeded' | 'failed',
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

/*订阅本地镜像变化，让上层 hook 继续使用最小广播模型。 */
export function subscribeFragmentMirror(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/*把单条远端碎片持久化到本地镜像，并更新详情内存快照。 */
export async function upsertRemoteFragmentSnapshot(fragment: Fragment, cachedAt?: string): Promise<void> {
  const database = await getLocalDatabase();
  const row = buildRemoteFragmentRow(fragment, cachedAt);
  await writeFragmentBodyFile(fragment.id, normalizeBodyHtml(fragment.body_html));
  await database
    .insert(fragmentsTable)
    .values(row)
    .onConflictDoUpdate({
      target: fragmentsTable.id,
      set: row,
    });
  await replaceRemoteMediaAssets(fragment.id, fragment.media_assets);
  detailMemoryCache.set(fragment.id, {
    ...fragment,
    body_html: normalizeBodyHtml(fragment.body_html),
    plain_text_snapshot: String(fragment.plain_text_snapshot ?? extractPlainTextFromHtml(fragment.body_html)),
  });
  emitMirrorChange();
}

/*批量持久化远端列表结果，供首页和文件夹页直接读取 SQLite。 */
export async function upsertRemoteFragmentSnapshots(items: Fragment[]): Promise<void> {
  await Promise.all(items.map((item) => upsertRemoteFragmentSnapshot(item)));
}

/*同步读取最近一次内存中的远端快照，供编辑器 hydrate 与局部预热使用。 */
export function peekRemoteFragmentSnapshot(fragmentId: string): Fragment | null {
  return detailMemoryCache.get(fragmentId) ?? null;
}

/*读取 SQLite 中的远端详情镜像，并把它预热进详情内存缓存。 */
export async function readRemoteFragmentSnapshot(fragmentId: string): Promise<Fragment | null> {
  const cached = detailMemoryCache.get(fragmentId);
  if (cached) {
    return cached;
  }
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(and(eq(fragmentsTable.id, fragmentId), eq(fragmentsTable.isLocalDraft, 0)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const mediaRows = await loadMediaRowsByFragmentIds([fragmentId]);
  const fragment = await mapRemoteRowToFragment(row, mediaRows.get(fragmentId) ?? []);
  detailMemoryCache.set(fragmentId, fragment);
  return fragment;
}

/*读取 SQLite 中的远端列表镜像，作为首页与文件夹页的唯一真值来源。 */
export async function readRemoteFragmentList(folderId?: string | null): Promise<Fragment[]> {
  const database = await getLocalDatabase();
  const normalizedFolderId = String(folderId ?? '').trim();
  const condition = normalizedFolderId
    ? and(
        eq(fragmentsTable.isLocalDraft, 0),
        isNull(fragmentsTable.deletedAt),
        eq(fragmentsTable.folderId, normalizedFolderId)
      )
    : and(eq(fragmentsTable.isLocalDraft, 0), isNull(fragmentsTable.deletedAt));
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(condition)
    .orderBy(desc(fragmentsTable.createdAt));
  const mediaRowsByFragmentId = await loadMediaRowsByFragmentIds(rows.map((row) => row.id));
  return await Promise.all(
    rows.map(async (row) => {
      const fragment = await mapRemoteRowToFragment(row, mediaRowsByFragmentId.get(row.id) ?? []);
      detailMemoryCache.set(row.id, fragment);
      return fragment;
    })
  );
}

/*预热详情页所需的远端碎片镜像，避免点击后还要等远端接口。 */
export async function prewarmRemoteFragmentSnapshot(fragment: Fragment): Promise<void> {
  await upsertRemoteFragmentSnapshot(fragment);
}

/*从本地镜像移除远端碎片，供删除成功后立即回收列表和详情。 */
export async function removeRemoteFragmentSnapshot(fragmentId: string): Promise<void> {
  const database = await getLocalDatabase();
  await database.delete(mediaAssetsTable).where(eq(mediaAssetsTable.fragmentId, fragmentId));
  await database.delete(fragmentsTable).where(eq(fragmentsTable.id, fragmentId));
  await deleteFileIfExists(getFragmentBodyFile(fragmentId));
  detailMemoryCache.delete(fragmentId);
  emitMirrorChange();
}

/*创建本地草稿镜像，并立即生成正文文件供编辑器进入。 */
export async function createLocalMirrorDraft(folderId?: string | null): Promise<LocalFragmentDraft> {
  const database = await getLocalDatabase();
  const localId = generateLocalId(LOCAL_FRAGMENT_ID_PREFIX);
  const createdAt = new Date().toISOString();
  await writeFragmentBodyFile(localId, '');
  await database.insert(fragmentsTable).values({
    id: localId,
    remoteId: null,
    folderId: folderId ?? null,
    source: 'manual',
    audioSource: null,
    createdAt,
    updatedAt: createdAt,
    summary: null,
    tagsJson: '[]',
    plainTextSnapshot: '',
    bodyFileUri: getFragmentBodyFile(localId).uri,
    transcript: null,
    speakerSegmentsJson: null,
    audioFileUri: null,
    audioFileUrl: null,
    audioFileExpiresAt: null,
    syncStatus: 'local_only',
    remoteSyncState: 'idle',
    lastSyncedAt: null,
    lastRemoteVersion: null,
    lastSyncAttemptAt: null,
    nextRetryAt: null,
    retryCount: 0,
    deletedAt: null,
    isLocalDraft: 1,
    localSyncStatus: 'creating',
    displaySourceLabel: '本地草稿',
    contentState: 'empty',
    cachedAt: createdAt,
  });
  emitMirrorChange();
  return (await loadLocalMirrorDraft(localId)) as LocalFragmentDraft;
}

/*按 local_id 读取本地草稿镜像，并补齐待上传图片列表。 */
export async function loadLocalMirrorDraft(localId: string): Promise<LocalFragmentDraft | null> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(and(eq(fragmentsTable.id, localId), eq(fragmentsTable.isLocalDraft, 1)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const mediaRows = await loadMediaRowsByFragmentIds([localId]);
  return await mapLocalDraftRow(row, mediaRows.get(localId) ?? []);
}

/*读取本地草稿列表，让首页和文件夹页把草稿聚合到远端列表顶部。 */
export async function listLocalMirrorDrafts(folderId?: string | null): Promise<LocalFragmentDraft[]> {
  const database = await getLocalDatabase();
  const normalizedFolderId = String(folderId ?? '').trim();
  const condition = normalizedFolderId
    ? and(
        eq(fragmentsTable.isLocalDraft, 1),
        isNull(fragmentsTable.deletedAt),
        eq(fragmentsTable.folderId, normalizedFolderId)
      )
    : and(eq(fragmentsTable.isLocalDraft, 1), isNull(fragmentsTable.deletedAt));
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(condition)
    .orderBy(desc(fragmentsTable.createdAt));
  const mediaRowsByFragmentId = await loadMediaRowsByFragmentIds(rows.map((row) => row.id));
  return await Promise.all(
    rows.map(async (row) => await mapLocalDraftRow(row, mediaRowsByFragmentId.get(row.id) ?? []))
  );
}

/*按补丁更新本地草稿镜像，并在需要时同步正文文件和待上传图片。 */
export async function saveLocalMirrorDraft(
  localId: string,
  patch: Partial<LocalFragmentDraft>
): Promise<LocalFragmentDraft | null> {
  const database = await getLocalDatabase();
  const current = await loadFragmentRowByIdOrRemoteId(localId);
  if (!current || current.isLocalDraft !== 1) {
    return null;
  }

  if (typeof patch.body_html === 'string') {
    const normalizedHtml = normalizeBodyHtml(patch.body_html);
    await writeFragmentBodyFile(localId, normalizedHtml);
    patch.plain_text_snapshot = extractPlainTextFromHtml(normalizedHtml);
  }

  await database
    .update(fragmentsTable)
    .set(buildLocalDraftRowPatch(current, patch))
    .where(eq(fragmentsTable.id, localId));

  if (patch.pending_image_assets) {
    const existingRows = await database
      .select()
      .from(mediaAssetsTable)
      .where(eq(mediaAssetsTable.fragmentId, localId));
    const nextIds = new Set(patch.pending_image_assets.map((asset) => asset.local_asset_id));
    await Promise.all(
      existingRows
        .filter((row) => !nextIds.has(row.id))
        .map((row) => database.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, row.id)))
    );
    for (const asset of patch.pending_image_assets) {
      await database
        .insert(mediaAssetsTable)
        .values({
          id: asset.local_asset_id,
          fragmentId: localId,
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
          createdAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: mediaAssetsTable.id,
          set: {
            remoteAssetId: asset.remote_asset_id ?? null,
            mimeType: asset.mime_type,
            fileName: asset.file_name,
            localFileUri: asset.local_uri,
            uploadStatus: asset.upload_status,
            status: asset.upload_status,
          },
        });
    }
  }

  emitMirrorChange();
  return await loadLocalMirrorDraft(localId);
}

/*删除本地草稿镜像，并一并清理它关联的待上传素材记录。 */
export async function deleteLocalMirrorDraft(localId: string): Promise<void> {
  const database = await getLocalDatabase();
  await database.delete(mediaAssetsTable).where(eq(mediaAssetsTable.fragmentId, localId));
  await database.delete(fragmentsTable).where(eq(fragmentsTable.id, localId));
  await deleteFileIfExists(getFragmentBodyFile(localId));
  detailMemoryCache.delete(localId);
  emitMirrorChange();
}

/*为本地草稿回填 remote_id，供同步成功后做远端去重与详情跳转。 */
export async function bindLocalMirrorDraftRemoteId(
  localId: string,
  remoteId: string
): Promise<LocalFragmentDraft | null> {
  return await saveLocalMirrorDraft(localId, {
    remote_id: remoteId,
    sync_status: 'syncing',
  });
}

/*统一更新本地草稿同步状态，保证 UI 与重试逻辑看到同一份状态。 */
export async function updateLocalMirrorDraftSyncState(
  localId: string,
  syncStatus: LocalFragmentSyncStatus,
  patch?: Partial<LocalFragmentDraft>
): Promise<LocalFragmentDraft | null> {
  return await saveLocalMirrorDraft(localId, {
    ...patch,
    sync_status: syncStatus,
  });
}

/*把图片先拷贝进 staging，再登记为本地草稿下的待上传素材。 */
export async function attachLocalMirrorPendingImage(
  localFragmentId: string,
  payload: Pick<LocalPendingImageAsset, 'local_uri' | 'mime_type' | 'file_name'>
): Promise<LocalPendingImageAsset | null> {
  const draft = await loadLocalMirrorDraft(localFragmentId);
  if (!draft) {
    return null;
  }
  const stagedFile = await prepareManagedImageFile(payload.local_uri, payload.file_name, payload.mime_type);
  const pendingAsset: LocalPendingImageAsset = {
    local_asset_id: generateLocalId(LOCAL_IMAGE_ASSET_ID_PREFIX),
    local_fragment_id: localFragmentId,
    local_uri: stagedFile.uri,
    mime_type: payload.mime_type,
    file_name: payload.file_name,
    remote_asset_id: null,
    upload_status: 'pending',
  };
  await saveLocalMirrorDraft(localFragmentId, {
    pending_image_assets: [...(draft.pending_image_assets ?? []), pendingAsset],
  });
  return pendingAsset;
}

/*回填待上传图片的上传状态和远端 asset id。 */
export async function markLocalMirrorPendingImageUploaded(
  localFragmentId: string,
  localAssetId: string,
  patch: Pick<LocalPendingImageAsset, 'remote_asset_id' | 'upload_status'>
): Promise<LocalFragmentDraft | null> {
  const draft = await loadLocalMirrorDraft(localFragmentId);
  if (!draft) {
    return null;
  }
  return await saveLocalMirrorDraft(localFragmentId, {
    pending_image_assets: (draft.pending_image_assets ?? []).map((asset) =>
      asset.local_asset_id === localAssetId ? { ...asset, ...patch } : asset
    ),
  });
}

/*写入远端正文草稿文件，并同步记录该片段处于未同步正文状态。 */
export async function writeRemoteBodyDraft(fragmentId: string, html: string): Promise<void> {
  const normalizedHtml = normalizeBodyHtml(html);
  await writeFragmentDraftBodyFile(fragmentId, normalizedHtml);
  const database = await getLocalDatabase();
  await database
    .update(fragmentsTable)
    .set({
      syncStatus: normalizedHtml ? 'unsynced' : 'synced',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(fragmentsTable.id, fragmentId));
  emitMirrorChange();
}

/*读取远端正文草稿文件，供详情页 hydrate 最近一次未同步输入。 */
export async function readRemoteBodyDraft(fragmentId: string): Promise<string | null> {
  return await readFragmentDraftBodyFile(fragmentId);
}

/*清理远端正文草稿文件，并把同步态恢复为已同步。 */
export async function clearRemoteBodyDraft(fragmentId: string): Promise<void> {
  await clearFragmentDraftBodyFile(fragmentId);
  const database = await getLocalDatabase();
  await database
    .update(fragmentsTable)
    .set({
      syncStatus: 'synced',
      updatedAt: new Date().toISOString(),
    })
    .where(eq(fragmentsTable.id, fragmentId));
  emitMirrorChange();
}

/*枚举所有存在远端正文草稿的片段 id，供应用启动时恢复同步队列。 */
export async function listRemoteBodyDraftIds(): Promise<string[]> {
  return await listFragmentDraftBodyIds();
}

/*把旧 AsyncStorage 缓存迁入 SQLite 与文件系统，保证升级后不丢本地内容。 */
async function migrateLegacyAsyncStorageIfNeeded(): Promise<void> {
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
      const html = normalizeBodyHtml(parsed.html ?? parsed.markdown ?? '');
      if (fragmentId && html) {
        await writeRemoteBodyDraft(fragmentId, html);
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
          await writeFragmentBodyFile(legacyDraft.local_id, normalizeBodyHtml(legacyDraft.body_html));
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
              plainTextSnapshot: legacyDraft.plain_text_snapshot ?? extractPlainTextFromHtml(legacyDraft.body_html),
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
              contentState: legacyDraft.body_html ? 'body_present' : 'empty',
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

/*确保本地数据库、文件目录和旧缓存迁移在应用启动阶段完成。 */
export async function ensureFragmentLocalMirrorReady(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = (async () => {
      await ensureFileRuntimeReady();
      await getLocalDatabase();
      await migrateLegacyAsyncStorageIfNeeded();
    })();
  }
  await migrationPromise;
}

/*读取某条本地草稿绑定的远端快照，供详情页背景刷新与 merge 使用。 */
export async function readBoundRemoteSnapshot(remoteId: string): Promise<Fragment | null> {
  return await readRemoteFragmentSnapshot(remoteId);
}

/*把远端详情镜像重新从 SQLite 刷到内存，供编辑器会话比较远端基线。 */
export async function refreshRemoteSnapshotMemory(remoteId: string): Promise<Fragment | null> {
  detailMemoryCache.delete(remoteId);
  return await readRemoteFragmentSnapshot(remoteId);
}

/*返回片段的 meta 目录路径，便于调试和后续扩展更多本地文件。 */
export function readFragmentMetaPath(fragmentId: string): string {
  return getFragmentMetaPath(fragmentId);
}
