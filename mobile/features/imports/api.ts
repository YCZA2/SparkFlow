import { API_ENDPOINTS } from '@/constants/config';
import { post } from '@/features/core/api/client';
import { buildExternalAudioImportPayload } from '@/features/imports/importState';
import type { TaskSubmissionHandle } from '@/types/task';

export interface ExternalAudioImportTask extends TaskSubmissionHandle {
  fragment_id: string | null;
  local_fragment_id?: string | null;
  source: string;
  audio_source: 'external_link';
}

/**
 提交抖音外链导入任务，返回异步 pipeline 句柄。
 */
export async function importExternalAudio(
  shareUrl: string,
  folderId: string | undefined,
  localFragmentId: string
): Promise<ExternalAudioImportTask> {
  return post<ExternalAudioImportTask>(
    API_ENDPOINTS.EXTERNAL_MEDIA.AUDIO_IMPORTS,
    buildExternalAudioImportPayload(shareUrl, folderId, localFragmentId)
  );
}
