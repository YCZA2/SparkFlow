interface TaskResource {
  resource_type?: string | null;
  resource_id?: string | null;
}

interface TaskLike {
  status?: string | null;
  resource?: TaskResource | null;
}

interface ExternalAudioImportPayload {
  share_url: string;
  platform: 'auto';
  folder_id?: string;
  local_fragment_id?: string;
}

export function buildExternalAudioImportPayload(
  shareUrl: string,
  folderId?: string,
  localFragmentId?: string
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
  if (localFragmentId) {
    payload.local_fragment_id = localFragmentId;
  }

  return payload;
}

export function isImportLinkReady(shareUrl: string): boolean {
  /*只允许非空分享链接进入导入流程，保持按钮可用态判断纯函数化。 */
  return buildExternalAudioImportPayload(shareUrl).share_url.length > 0;
}

export function resolveImportedFragmentId(taskFragmentId: string | null, task?: TaskLike | null): string | null {
  /*优先读取 task 回写的最终资源 id，失败时回落到任务初始 fragment_id。 */
  if (
    task &&
    task.status === 'succeeded' &&
    task.resource &&
    (task.resource.resource_type === 'fragment' ||
      task.resource.resource_type === 'local_fragment') &&
    task.resource.resource_id
  ) {
    return task.resource.resource_id;
  }

  return taskFragmentId || null;
}
