import { getBackendUrl } from '@/constants/config';

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

export async function resolveFragmentAudioUrl(audioFileUrl: string | null | undefined): Promise<string | null> {
  if (!audioFileUrl) {
    return null;
  }

  if (/^https?:\/\//i.test(audioFileUrl)) {
    return audioFileUrl;
  }

  const baseUrl = await getBackendUrl();
  return joinUrl(baseUrl, audioFileUrl);
}
