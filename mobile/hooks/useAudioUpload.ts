import { useState } from 'react';
import { uploadAudio } from '@/services/transcribe';
import { ApiError } from '@/services/client';

interface UploadResult {
  fragment_id: string;
  audio_path: string;
  message: string;
}

export function useAudioUpload() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (uri: string) => {
    if (!uri) return null;

    try {
      setStatus('loading');
      setError(null);
      setResult(null);
      const response = await uploadAudio<{
        fragment_id: string;
        audio_path: string;
        relative_path: string;
        file_size: number;
        message: string;
      }>(uri);
      const nextResult = {
        fragment_id: response.fragment_id,
        audio_path: response.audio_path,
        message: response.message,
      };
      setResult(nextResult);
      setStatus('success');
      return nextResult;
    } catch (err) {
      const message =
        err instanceof ApiError && err.code === 'NETWORK_ERROR'
          ? '网络不可用，请检查网络连接后重试'
          : err instanceof Error
          ? err.message
          : '上传失败，请重试';
      setError(message);
      setStatus('error');
      throw err;
    }
  };

  const reset = () => {
    setStatus('idle');
    setResult(null);
    setError(null);
  };

  return {
    status,
    result,
    error,
    upload,
    reset,
  };
}
