import { getBackendUrl } from '@/constants/config';

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function resolveFragmentAudioUrl(audioPath: string | null | undefined): Promise<string | null> {
  if (!audioPath) {
    return null;
  }

  if (/^https?:\/\//i.test(audioPath)) {
    return audioPath;
  }

  const baseUrl = await getBackendUrl();
  return joinUrl(baseUrl, audioPath);
}
