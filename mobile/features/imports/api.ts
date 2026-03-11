import { API_ENDPOINTS } from '@/constants/config';
import { post } from '@/features/core/api/client';
import { buildExternalAudioImportPayload } from '@/features/imports/importState';

export interface ExternalAudioImportTask {
  pipeline_run_id: string;
  pipeline_type: 'media_ingestion';
  fragment_id: string | null;
  source: string;
  audio_source: 'external_link';
}

/**
 * 中文注释：提交抖音外链导入任务，返回异步 pipeline 句柄。
 */
export async function importExternalAudio(shareUrl: string, folderId?: string): Promise<ExternalAudioImportTask> {
  return post<ExternalAudioImportTask>(
    API_ENDPOINTS.EXTERNAL_MEDIA.AUDIO_IMPORTS,
    buildExternalAudioImportPayload(shareUrl, folderId)
  );
}
