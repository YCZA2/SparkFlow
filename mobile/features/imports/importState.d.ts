import type { PipelineRun } from '@/types/script';

export interface ExternalAudioImportPayload {
  share_url: string;
  platform: 'auto';
  folder_id?: string;
}

export function buildExternalAudioImportPayload(
  shareUrl: string,
  folderId?: string
): ExternalAudioImportPayload;

export function isImportLinkReady(shareUrl: string): boolean;

export function resolveImportedFragmentId(
  taskFragmentId: string | null | undefined,
  pipeline: PipelineRun
): string | null;
