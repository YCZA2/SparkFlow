export function buildExternalAudioImportPayload(shareUrl, folderId) {
  const trimmedShareUrl = typeof shareUrl === 'string' ? shareUrl.trim() : '';
  const payload = {
    share_url: trimmedShareUrl,
    platform: 'auto',
  };

  if (folderId) {
    payload.folder_id = folderId;
  }

  return payload;
}

export function isImportLinkReady(shareUrl) {
  return buildExternalAudioImportPayload(shareUrl).share_url.length > 0;
}

export function resolveImportedFragmentId(taskFragmentId, pipeline) {
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
