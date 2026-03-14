import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';

import { getLocalDatabase } from '@/features/core/db/database';
import { fragmentsTable, mediaAssetsTable } from '@/features/core/db/schema';
import {
  getFragmentBodyFile,
  prepareManagedImageFile,
  readFragmentBodyFile,
  writeFragmentBodyFile,
} from '@/features/core/files/runtime';
import {
  createImageHtml,
  extractAssetIdsFromHtml,
  extractPlainTextFromHtml,
  normalizeBodyHtml,
} from '@/features/editor/html';
import { normalizeFragmentTags } from '@/features/fragments/utils';
import type {
  Fragment,
  FragmentSyncStatus,
  LocalFragmentDraft,
  LocalPendingImageAsset,
  MediaAsset,
} from '@/types/fragment';

export const LEGACY_FRAGMENT_DETAIL_PREFIX = '@fragment_cache:v1:detail:';
export const LEGACY_FRAGMENT_LIST_PREFIX = '@fragment_cache:v1:list:';
export const LEGACY_FRAGMENT_BODY_DRAFT_PREFIX = '@fragment_body_html_draft:';
export const LEGACY_LOCAL_DRAFTS_STORAGE_KEY = '@local_fragment_drafts:v1';
export const LEGACY_MIGRATION_FLAG = '@local_fragment_mirror_migrated:v1';
export const LOCAL_IMAGE_ASSET_ID_PREFIX = 'local:image:';

export type FragmentRow = typeof fragmentsTable.$inferSelect;
export type MediaAssetRow = typeof mediaAssetsTable.$inferSelect;

/*为本地草稿生成稳定的 UUID 主键。 */
export function generateFragmentId(): string {
  return `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

/*为本地图片生成临时 ID。 */
export function generateLocalImageId(): string {
  return `${LOCAL_IMAGE_ASSET_ID_PREFIX}${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

/*判断是否为本地图片临时 ID。 */
export function isLocalImageId(assetId: string): boolean {
  return assetId.startsWith(LOCAL_IMAGE_ASSET_ID_PREFIX);
}

/*把标签统一序列化为 JSON 文本，便于 SQLite 持久化。 */
export function serializeTags(tags: string[] | null | undefined): string {
  return JSON.stringify(normalizeFragmentTags(tags));
}

/*从 SQLite 记录中恢复标签数组，避免旧数据结构污染 UI。 */
export function deserializeTags(raw: string | null | undefined): string[] {
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
export function serializeSpeakerSegments(
  segments: Fragment['speaker_segments']
): string | null {
  if (!segments) {
    return null;
  }
  return JSON.stringify(segments);
}

/*把 speaker segments JSON 还原为页面消费的数组结构。 */
export function deserializeSpeakerSegments(
  raw: string | null | undefined
): Fragment['speaker_segments'] {
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

/*按 SQLite 行还原媒体资源，供详情与编辑器直接消费。 */
export function mapMediaAssetRow(row: MediaAssetRow): MediaAsset {
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
export async function mapRemoteRowToFragment(
  row: FragmentRow,
  mediaRows: MediaAssetRow[]
): Promise<Fragment> {
  const bodyHtml = normalizeBodyHtml(await readFragmentBodyFile(row.id));
  return {
    id: row.id,
    server_id: row.serverId ?? null,
    sync_status: 'synced',
    audio_file_url: row.audioFileUrl,
    audio_file_expires_at: row.audioFileExpiresAt ?? undefined,
    transcript: row.transcript,
    speaker_segments: deserializeSpeakerSegments(row.speakerSegmentsJson),
    summary: row.summary,
    tags: deserializeTags(row.tagsJson),
    source: row.source as Fragment['source'],
    audio_source: (row.audioSource as Fragment['audio_source']) ?? null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    folder_id: row.folderId ?? null,
    folder: null,
    body_html: bodyHtml,
    plain_text_snapshot: row.plainTextSnapshot,
    content_state:
      (row.contentState as Fragment['content_state']) ?? (bodyHtml ? 'body_present' : 'empty'),
    media_assets: mediaRows.map(mapMediaAssetRow),
  };
}

/*按本地镜像行与待上传素材组装 local draft 记录。 */
export async function mapLocalDraftRow(
  row: FragmentRow,
  mediaRows: MediaAssetRow[]
): Promise<LocalFragmentDraft> {
  const bodyHtml = normalizeBodyHtml(await readFragmentBodyFile(row.id));
  const hasServerId = Boolean(row.serverId);
  const isSynced = row.syncStatus === 'synced';
  return {
    id: row.id,
    server_id: row.serverId ?? null,
    folder_id: row.folderId ?? null,
    body_html: bodyHtml,
    plain_text_snapshot: row.plainTextSnapshot || extractPlainTextFromHtml(bodyHtml),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    sync_status: isSynced ? 'synced' : 'pending',
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
export function buildRemoteFragmentRow(
  fragment: Fragment,
  cachedAt?: string
): typeof fragmentsTable.$inferInsert {
  const now = new Date().toISOString();
  return {
    id: fragment.id,
    serverId: fragment.id, // 服务端返回的 ID 作为 serverId
    folderId: fragment.folder_id ?? null,
    source: fragment.source,
    audioSource: fragment.audio_source ?? null,
    createdAt: fragment.created_at,
    updatedAt: fragment.updated_at ?? fragment.created_at,
    summary: fragment.summary ?? null,
    tagsJson: serializeTags(fragment.tags),
    plainTextSnapshot: String(
      fragment.plain_text_snapshot ?? extractPlainTextFromHtml(fragment.body_html)
    ),
    bodyFileUri: getFragmentBodyFile(fragment.id).uri,
    transcript: fragment.transcript ?? null,
    speakerSegmentsJson: serializeSpeakerSegments(fragment.speaker_segments),
    audioFileUri: fragment.audio_file_url ?? null,
    audioFileUrl: fragment.audio_file_url ?? null,
    audioFileExpiresAt: fragment.audio_file_expires_at ?? null,
    syncStatus: 'synced',
    lastSyncedAt: now,
    lastSyncAttemptAt: null,
    nextRetryAt: null,
    retryCount: 0,
    deletedAt: null,
    contentState: fragment.content_state ?? null,
    cachedAt: cachedAt ?? now,
  };
}

/*把 LocalFragmentDraft patch 映射为 fragments 表更新字段。 */
export function buildLocalDraftRowPatch(
  current: FragmentRow,
  patch: Partial<LocalFragmentDraft>
): Partial<typeof fragmentsTable.$inferInsert> {
  return {
    serverId: patch.server_id === undefined ? current.serverId : patch.server_id,
    folderId: patch.folder_id === undefined ? current.folderId : patch.folder_id,
    updatedAt: new Date().toISOString(),
    plainTextSnapshot:
      typeof patch.plain_text_snapshot === 'string'
        ? patch.plain_text_snapshot
        : current.plainTextSnapshot,
    syncStatus:
      patch.sync_status === undefined ? current.syncStatus : patch.sync_status,
    lastSyncAttemptAt:
      patch.last_sync_attempt_at === undefined
        ? current.lastSyncAttemptAt
        : patch.last_sync_attempt_at,
    nextRetryAt: patch.next_retry_at === undefined ? current.nextRetryAt : patch.next_retry_at,
    retryCount: patch.retry_count === undefined ? current.retryCount : patch.retry_count,
  };
}

/*按 fragment_id 批量读取素材行，避免列表和详情多次往返数据库。 */
export async function loadMediaRowsByFragmentIds(
  fragmentIds: string[]
): Promise<Map<string, MediaAssetRow[]>> {
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

/*按 id 或 server_id 查询单条 fragments 行，供绑定服务端 id 等场景复用。 */
export async function loadFragmentRowByIdOrServerId(
  identifier: string
): Promise<FragmentRow | null> {
  const database = await getLocalDatabase();
  const rows = await database
    .select()
    .from(fragmentsTable)
    .where(or(eq(fragmentsTable.id, identifier), eq(fragmentsTable.serverId, identifier)))
    .limit(1);
  return rows[0] ?? null;
}

/*用远端素材列表替换远端镜像下的媒体资源，同时保留独立本地草稿的待上传项。 */
export async function replaceRemoteMediaAssets(
  fragmentId: string,
  mediaAssets: MediaAsset[] | undefined
): Promise<void> {
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

/*创建本地草稿时顺手生成空图片节点，供后续图片插入测试复用。 */
export function createPendingImageHtml(assetId: string): string {
  return createImageHtml(assetId);
}

/*从正文中读取图片 asset 引用，供同步阶段回传 media_asset_ids。 */
export function readAssetIdsFromHtml(html: string): string[] {
  return extractAssetIdsFromHtml(html);
}

/*把图片先拷贝进 staging，统一返回后续可持久化的本地文件。 */
export async function stagePendingImage(
  localUri: string,
  fileName: string,
  mimeType: string
) {
  return await prepareManagedImageFile(localUri, fileName, mimeType);
}

/*读取远端列表时统一构造文件夹筛选条件，避免多模块复制判断。 */
export function buildFragmentListCondition(folderId?: string | null) {
  const normalizedFolderId = String(folderId ?? '').trim();
  if (normalizedFolderId) {
    return and(
      isNull(fragmentsTable.deletedAt),
      eq(fragmentsTable.folderId, normalizedFolderId)
    );
  }
  return isNull(fragmentsTable.deletedAt);
}

/*统一按更新时间倒序读取 fragments 行，保持首页与文件夹页排序一致。 */
export async function readFragmentRows(
  folderId?: string | null
): Promise<FragmentRow[]> {
  const database = await getLocalDatabase();
  return await database
    .select()
    .from(fragmentsTable)
    .where(buildFragmentListCondition(folderId))
    .orderBy(desc(fragmentsTable.updatedAt));
}

/*直接写入某个 fragment 的正文文件，并同步补齐纯文本快照。 */
export async function persistBodyHtml(fragmentId: string, html: string): Promise<string> {
  const normalizedHtml = normalizeBodyHtml(html);
  await writeFragmentBodyFile(fragmentId, normalizedHtml);
  return normalizedHtml;
}

