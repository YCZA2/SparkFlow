import { API_ENDPOINTS } from '@/constants/config';
import { fetchApi, sendForm } from '@/features/core/api/client';

export interface UploadAudioResponse {
  fragment_id: string;
  audio_path: string;
  relative_path: string;
  file_size: number;
  message: string;
}

export interface TranscribeStatusResponse {
  fragment_id: string;
  sync_status: string;
  transcript: string | null;
  summary: string | null;
  tags: string[] | null;
  audio_path: string | null;
  created_at: string;
}

export async function uploadAudio<T = UploadAudioResponse>(uri: string): Promise<T> {
  const filename = uri.split('/').pop() || 'recording.m4a';
  const formData = new FormData();
  formData.append('audio', {
    uri,
    name: filename,
    type: 'audio/m4a',
  } as never);

  return sendForm<T>(API_ENDPOINTS.TRANSCRIPTIONS, 'POST', formData);
}

export async function getTranscribeStatus(fragmentId: string): Promise<TranscribeStatusResponse> {
  return fetchApi<TranscribeStatusResponse>(`${API_ENDPOINTS.TRANSCRIPTIONS}/${fragmentId}`);
}
