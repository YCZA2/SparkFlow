import { API_ENDPOINTS } from '@/constants/config';
import { fetchApi, sendForm } from '@/features/core/api/client';

export interface UploadAudioResponse {
  pipeline_run_id: string;
  pipeline_type: 'media_ingestion';
  fragment_id: string | null;
  audio_path: string | null;
  relative_path: string | null;
  file_size: number;
  duration: number | null;
}

export interface TranscribeStatusResponse {
  fragment_id: string;
  transcript: string | null;
  summary: string | null;
  tags: string[] | null;
  audio_path: string | null;
  created_at: string;
}

export async function uploadAudio(uri: string, folderId?: string): Promise<UploadAudioResponse> {
  const filename = uri.split('/').pop() || 'recording.m4a';
  const formData = new FormData();
  formData.append('audio', {
    uri,
    name: filename,
    type: 'audio/m4a',
  } as never);

  // 如果指定了文件夹ID，添加到表单中
  if (folderId) {
    formData.append('folder_id', folderId);
  }

  return sendForm<UploadAudioResponse>(API_ENDPOINTS.TRANSCRIPTIONS, 'POST', formData);
}

export async function getTranscribeStatus(fragmentId: string): Promise<TranscribeStatusResponse> {
  return fetchApi<TranscribeStatusResponse>(`${API_ENDPOINTS.TRANSCRIPTIONS}/${fragmentId}`);
}
