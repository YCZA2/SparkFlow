interface PipelineResource {
  resource_type?: string | null;
  resource_id?: string | null;
}

interface PipelineLike {
  status?: string | null;
  resource?: PipelineResource | null;
}

interface ExternalAudioImportPayload {
  share_url: string;
  platform: 'auto';
  folder_id?: string;
}

export function buildExternalAudioImportPayload(
  shareUrl: string,
  folderId?: string
): ExternalAudioImportPayload {
  /*统一整理外链导入载荷，避免页面层重复处理空白链接和 folderId。 */
  const trimmedShareUrl = typeof shareUrl === 'string' ? shareUrl.trim() : '';
  const payload: ExternalAudioImportPayload = {
    share_url: trimmedShareUrl,
    platform: 'auto',
  };

  if (folderId) {
    payload.folder_id = folderId;
  }

  return payload;
}

export function isImportLinkReady(shareUrl: string): boolean {
  /*只允许非空分享链接进入导入流程，保持按钮可用态判断纯函数化。 */
  return buildExternalAudioImportPayload(shareUrl).share_url.length > 0;
}

export function resolveImportedFragmentId(taskFragmentId: string | null, pipeline?: PipelineLike | null): string | null {
  /*优先读取 pipeline 回写的最终资源 id，失败时回落到任务初始 fragment_id。 */
  if (
    pipeline &&
    pipeline.status === 'succeeded' &&
    pipeline.resource &&
    pipeline.resource.resource_type === 'fragment' &&
    pipeline.resource.resource_id
  ) {
    return pipeline.resource.resource_id;
  }

  return taskFragmentId || null;
}
