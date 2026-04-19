import type { Fragment } from '@/types/fragment';
import { normalizeFragmentTags } from '@/features/fragments/utils';

import type { FragmentRow } from './shared';

export interface FragmentEntityPatch
  extends Partial<Fragment> {
  backup_status?: Fragment['backup_status'];
  entity_version?: number;
  last_backup_at?: string | null;
  deleted_at?: string | null;
  last_modified_device_id?: string | null;
}

interface ResolveFragmentEntityUpdateInput {
  current: FragmentRow;
  patch: FragmentEntityPatch;
  bodyFileUri: string | null;
  plainTextSnapshot: string;
}

interface ResolveFragmentEntityUpdateResult {
  nextRow: {
    folderId: string | null;
    source: string;
    audioSource: string | null;
    createdAt: string;
    updatedAt: string;
    summary: string | null;
    tagsJson: string;
    plainTextSnapshot: string;
    transcript: string | null;
    mediaTaskRunId: string | null;
    mediaTaskStatus: string | null;
    mediaTaskErrorMessage: string | null;
    speakerSegmentsJson: string | null;
    audioObjectKey: string | null;
    audioFileUrl: string | null;
    audioFileExpiresAt: string | null;
    bodyFileUri: string | null;
    contentState: string | null;
    backupStatus: string;
    entityVersion: number;
    lastBackupAt: string | null;
    lastModifiedDeviceId: string | null;
    deletedAt: string | null;
    isFilmed: number;
    filmedAt: string | null;
  };
  didChangeAnyField: boolean;
}

/*统一比较字段是否真的变化，避免无意义 patch 把更新时间顶到列表前面。 */
function hasValueChanged<T>(current: T, next: T): boolean {
  return current !== next;
}

/*把 tags 收敛成稳定 JSON，确保“是否修改”比较不会受输入形态干扰。 */
function serializeFragmentTags(tags: string[] | null | undefined): string {
  return JSON.stringify(normalizeFragmentTags(tags));
}

/*把 speaker segments 统一成 JSON 文本，便于和 SQLite 当前值直接比较。 */
function serializeFragmentSpeakerSegments(
  segments: Fragment['speaker_segments']
): string | null {
  if (!segments) {
    return null;
  }
  return JSON.stringify(segments);
}

/*把 fragment patch 解析成最终行更新，只有真实业务变化才推进更新时间和版本号。 */
export function resolveFragmentEntityUpdate(input: ResolveFragmentEntityUpdateInput): ResolveFragmentEntityUpdateResult {
  const { current, patch, bodyFileUri, plainTextSnapshot } = input;
  const nextRowBase = {
    folderId: patch.folder_id === undefined ? current.folderId : patch.folder_id,
    source: patch.source === undefined ? current.source : patch.source,
    audioSource: patch.audio_source === undefined ? current.audioSource : patch.audio_source,
    createdAt: patch.created_at === undefined ? current.createdAt : patch.created_at,
    summary: patch.summary === undefined ? current.summary : patch.summary,
    tagsJson: patch.tags === undefined ? current.tagsJson : serializeFragmentTags(patch.tags),
    plainTextSnapshot,
    transcript: patch.transcript === undefined ? current.transcript : patch.transcript,
    mediaTaskRunId:
      patch.media_task_run_id === undefined
        ? current.mediaTaskRunId
        : patch.media_task_run_id,
    mediaTaskStatus:
      patch.media_task_status === undefined
        ? current.mediaTaskStatus
        : patch.media_task_status,
    mediaTaskErrorMessage:
      patch.media_task_error_message === undefined
        ? current.mediaTaskErrorMessage
        : patch.media_task_error_message,
    speakerSegmentsJson:
      patch.speaker_segments === undefined
        ? current.speakerSegmentsJson
        : serializeFragmentSpeakerSegments(patch.speaker_segments),
    audioObjectKey:
      patch.audio_object_key === undefined ? current.audioObjectKey : patch.audio_object_key,
    audioFileUrl:
      patch.audio_file_url === undefined ? current.audioFileUrl : patch.audio_file_url,
    audioFileExpiresAt:
      patch.audio_file_expires_at === undefined
        ? current.audioFileExpiresAt
        : patch.audio_file_expires_at,
    bodyFileUri,
    contentState: patch.content_state === undefined ? current.contentState : patch.content_state,
    lastBackupAt: patch.last_backup_at === undefined ? current.lastBackupAt : patch.last_backup_at,
    deletedAt: patch.deleted_at === undefined ? current.deletedAt : patch.deleted_at,
    isFilmed: patch.is_filmed === undefined ? current.isFilmed : patch.is_filmed ? 1 : 0,
    filmedAt: patch.filmed_at === undefined ? current.filmedAt : patch.filmed_at,
  };

  const didMeaningfullyChange =
    hasValueChanged(current.folderId, nextRowBase.folderId) ||
    hasValueChanged(current.source, nextRowBase.source) ||
    hasValueChanged(current.audioSource, nextRowBase.audioSource) ||
    hasValueChanged(current.createdAt, nextRowBase.createdAt) ||
    hasValueChanged(current.summary, nextRowBase.summary) ||
    hasValueChanged(current.tagsJson, nextRowBase.tagsJson) ||
    hasValueChanged(current.plainTextSnapshot, nextRowBase.plainTextSnapshot) ||
    hasValueChanged(current.transcript, nextRowBase.transcript) ||
    hasValueChanged(current.speakerSegmentsJson, nextRowBase.speakerSegmentsJson) ||
    hasValueChanged(current.audioObjectKey, nextRowBase.audioObjectKey) ||
    hasValueChanged(current.audioFileUrl, nextRowBase.audioFileUrl) ||
    hasValueChanged(current.audioFileExpiresAt, nextRowBase.audioFileExpiresAt) ||
    hasValueChanged(current.bodyFileUri, nextRowBase.bodyFileUri) ||
    hasValueChanged(current.contentState, nextRowBase.contentState) ||
    hasValueChanged(current.deletedAt, nextRowBase.deletedAt) ||
    hasValueChanged(current.isFilmed, nextRowBase.isFilmed) ||
    hasValueChanged(current.filmedAt, nextRowBase.filmedAt);

  const nextRow = {
    ...nextRowBase,
    updatedAt: didMeaningfullyChange ? new Date().toISOString() : current.updatedAt,
    backupStatus:
      patch.backup_status !== undefined
        ? patch.backup_status
        : didMeaningfullyChange
          ? 'pending'
          : current.backupStatus,
    entityVersion:
      patch.entity_version !== undefined
        ? patch.entity_version
        : didMeaningfullyChange
          ? current.entityVersion + 1
          : current.entityVersion,
    lastModifiedDeviceId:
      didMeaningfullyChange && patch.last_modified_device_id !== undefined
        ? patch.last_modified_device_id
        : current.lastModifiedDeviceId,
  };

  const didChangeAnyField =
    didMeaningfullyChange ||
    hasValueChanged(current.updatedAt, nextRow.updatedAt) ||
    hasValueChanged(current.mediaTaskRunId, nextRow.mediaTaskRunId) ||
    hasValueChanged(current.mediaTaskStatus, nextRow.mediaTaskStatus) ||
    hasValueChanged(current.mediaTaskErrorMessage, nextRow.mediaTaskErrorMessage) ||
    hasValueChanged(current.backupStatus, nextRow.backupStatus) ||
    hasValueChanged(current.entityVersion, nextRow.entityVersion) ||
    hasValueChanged(current.lastBackupAt, nextRow.lastBackupAt) ||
    hasValueChanged(current.lastModifiedDeviceId, nextRow.lastModifiedDeviceId);

  return {
    nextRow,
    didChangeAnyField,
  };
}
