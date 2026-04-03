import { Directory, File } from 'expo-file-system';

import {
  createManagedNativeFile,
  ensureTrailingSlash,
  getFileWorkspaceUserId,
  getFragmentAssetsDirectoryUri,
  getFragmentBodyFile,
  getFragmentDraftBodyFile,
  getFragmentMetaPath,
  getFragmentsDirectoryUri,
  getRootDirectoryUri,
  getScriptBodyFile,
  getScriptsDirectoryUri,
  getStagingAudioDirectoryUri,
  getStagingDirectoryUri,
  getStagingImageDirectoryUri,
  ManagedAppFile,
  ManagedAppFileKind,
  ManagedAppFileSource,
  ManagedNativeFile,
  sanitizeFileName,
  toDirectoryHandle,
  toFileHandle,
} from './runtimePaths.native';

/*确保目标目录存在，避免文件读写时反复做空判断。 */
export function ensureDirectoryAsync(directoryUri: string): Promise<string> {
  const normalizedUri = ensureTrailingSlash(directoryUri);
  const directory = toDirectoryHandle(new Directory(normalizedUri));
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return Promise.resolve(normalizedUri);
}

/*把文本写入指定文件，并确保父目录已提前准备好。 */
export async function writeTextFile(file: ManagedNativeFile, content: string): Promise<string> {
  await ensureDirectoryAsync(file.parentDirectoryUri);
  const handle = toFileHandle(new File(file.uri));
  if (!handle.exists) {
    handle.create({ intermediates: true, overwrite: true });
  }
  handle.write(content);
  return file.uri;
}

/*读取文本文件内容，文件缺失时返回 null 而不是抛异常。 */
export async function readTextFile(file: ManagedNativeFile): Promise<string | null> {
  const handle = toFileHandle(new File(file.uri));
  if (!handle.exists) {
    return null;
  }
  return await handle.text();
}

/*删除指定文件，供草稿清理和同步成功后的回收使用。 */
export async function deleteFileIfExists(file: ManagedNativeFile): Promise<void> {
  const handle = toFileHandle(new File(file.uri));
  if (!handle.exists) {
    return;
  }
  handle.delete();
}

/*把正式正文写入片段目录，供详情与列表镜像消费。 */
export async function writeFragmentBodyFile(fragmentId: string, html: string): Promise<string> {
  return await writeTextFile(getFragmentBodyFile(fragmentId), html);
}

/*读取片段正式正文，缺失时回退到空内容。 */
export async function readFragmentBodyFile(fragmentId: string): Promise<string | null> {
  return await readTextFile(getFragmentBodyFile(fragmentId));
}

/*把正式正文写入 script 目录，供成稿详情和列表镜像消费。 */
export async function writeScriptBodyFile(scriptId: string, html: string): Promise<string> {
  return await writeTextFile(getScriptBodyFile(scriptId), html);
}

/*读取 script 正式正文，缺失时返回 null。 */
export async function readScriptBodyFile(scriptId: string): Promise<string | null> {
  return await readTextFile(getScriptBodyFile(scriptId));
}

/*把兼容草稿正文写到 meta 目录，避免污染正式基线文件。 */
export async function writeFragmentDraftBodyFile(fragmentId: string, html: string): Promise<string> {
  return await writeTextFile(getFragmentDraftBodyFile(fragmentId), html);
}

/*读取兼容草稿正文，供编辑器 hydrate 优先恢复最近输入。 */
export async function readFragmentDraftBodyFile(fragmentId: string): Promise<string | null> {
  return await readTextFile(getFragmentDraftBodyFile(fragmentId));
}

/*清理兼容草稿正文文件，让持久化成功后的状态回到干净基线。 */
export async function clearFragmentDraftBodyFile(fragmentId: string): Promise<void> {
  await deleteFileIfExists(getFragmentDraftBodyFile(fragmentId));
}

/*枚举当前本地存在正文草稿的片段 id，用于启动时恢复同步。 */
export async function listFragmentDraftBodyIds(): Promise<string[]> {
  const fragmentsDirectoryUri = getFragmentsDirectoryUri();
  await ensureDirectoryAsync(fragmentsDirectoryUri);
  const entries = toDirectoryHandle(new Directory(fragmentsDirectoryUri)).list();
  return entries
    .filter((entry): entry is Directory => entry instanceof Directory)
    .map((directory) => directory.name)
    .filter((fragmentId) => toFileHandle(new File(getFragmentDraftBodyFile(fragmentId).uri)).exists);
}

/*递归删除目录及其所有内容。 */
function deleteDirectoryRecursively(directory: Directory): void {
  const handle = toDirectoryHandle(directory);
  if (!handle.exists) {
    return;
  }
  for (const entry of handle.list()) {
    if (entry instanceof Directory) {
      deleteDirectoryRecursively(entry);
    } else {
      toFileHandle(entry).delete();
    }
  }
  handle.delete();
}

/*递归清空 fragments 目录，供显式恢复时重建本地正文文件使用。 */
export async function resetFragmentFiles(): Promise<void> {
  const fragmentsDirectoryUri = getFragmentsDirectoryUri();
  await ensureDirectoryAsync(fragmentsDirectoryUri);
  for (const entry of toDirectoryHandle(new Directory(fragmentsDirectoryUri)).list()) {
    if (entry instanceof Directory) {
      deleteDirectoryRecursively(entry);
    } else {
      toFileHandle(entry).delete();
    }
  }
}

/*删除不在 keepIds 集合中的 fragment 目录，供恢复后清理已删除/过期碎片的文件。 */
export async function cleanupStaleFragmentDirectories(keepIds: Set<string>): Promise<void> {
  const fragmentsDirectoryUri = getFragmentsDirectoryUri();
  await ensureDirectoryAsync(fragmentsDirectoryUri);
  for (const entry of toDirectoryHandle(new Directory(fragmentsDirectoryUri)).list()) {
    if (entry instanceof Directory && !keepIds.has(entry.name)) {
      deleteDirectoryRecursively(entry);
    }
  }
}

/*递归清空 scripts 目录，供显式恢复或重建成稿本地镜像使用。 */
export async function resetScriptFiles(): Promise<void> {
  const scriptsDirectoryUri = getScriptsDirectoryUri();
  await ensureDirectoryAsync(scriptsDirectoryUri);
  for (const entry of toDirectoryHandle(new Directory(scriptsDirectoryUri)).list()) {
    if (entry instanceof Directory) {
      deleteDirectoryRecursively(entry);
    } else {
      toFileHandle(entry).delete();
    }
  }
}

/*把备份文件下载到片段私有目录，恢复后优先走本地缓存访问。 */
export async function downloadRemoteFileToFragment(input: {
  fragmentId: string;
  url: string;
  fileName: string;
  kind: ManagedAppFileKind;
  mimeType: string;
}): Promise<ManagedAppFile> {
  const targetDirectoryUri = await ensureDirectoryAsync(getFragmentAssetsDirectoryUri(input.fragmentId));
  const uniqueName = `${Date.now()}-${sanitizeFileName(
    input.fileName,
    input.kind === 'audio' ? 'audio.bin' : input.kind === 'image' ? 'image.bin' : 'file.bin'
  )}`;
  const targetFile = createManagedNativeFile(targetDirectoryUri, uniqueName);
  const downloaded = await File.downloadFileAsync(input.url, new File(targetFile.uri));
  const handle = toFileHandle(downloaded as unknown as File);

  return {
    uri: downloaded.uri,
    name: targetFile.name,
    mimeType: input.mimeType,
    size: handle.size ?? 0,
    kind: input.kind,
    source: 'backup-cache',
  };
}

/*把外部 URI 复制到 staging 目录，统一转换成可控的 app sandbox 文件。 */
export async function stageExternalFile(input: {
  kind: ManagedAppFileKind;
  uri: string;
  fileName: string;
  mimeType: string;
  source: ManagedAppFileSource;
}): Promise<ManagedAppFile> {
  const targetDirectoryUri =
    input.kind === 'audio'
      ? await ensureDirectoryAsync(getStagingAudioDirectoryUri())
      : await ensureDirectoryAsync(getStagingImageDirectoryUri());
  const uniqueName = `${Date.now()}-${sanitizeFileName(
    input.fileName,
    input.kind === 'audio' ? 'audio.bin' : 'image.bin'
  )}`;
  const targetFile = createManagedNativeFile(targetDirectoryUri, uniqueName);
  const targetHandle = toFileHandle(new File(targetFile.uri));
  if (targetHandle.exists) {
    targetHandle.delete();
  }
  const sourceFile = toFileHandle(new File(input.uri));
  sourceFile.copy(new File(targetFile.uri));
  const copiedHandle = toFileHandle(new File(targetFile.uri));
  return {
    uri: targetFile.uri,
    name: targetFile.name,
    mimeType: input.mimeType,
    size: copiedHandle.size ?? 0,
    kind: input.kind,
    source: input.source,
  };
}

/*把本地受管文件转换成上传所需的 multipart 载荷。 */
export function buildMultipartFilePart(file: ManagedAppFile): { uri: string; name: string; type: string } {
  return {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  };
}

/*为音频上传把已有本地 URI 规整成统一文件描述，避免调用方各自猜测文件名。 */
export async function prepareManagedAudioFile(
  uri: string,
  fileName?: string,
  mimeType = 'audio/m4a',
  source: ManagedAppFileSource = 'recording'
): Promise<ManagedAppFile> {
  const normalizedName = sanitizeFileName(fileName ?? uri.split('/').pop() ?? 'recording.m4a', 'recording.m4a');
  return await stageExternalFile({
    kind: 'audio',
    uri,
    fileName: normalizedName,
    mimeType,
    source,
  });
}

/*为图片上传生成统一 staging 文件，减少内容 URI 与临时路径差异。 */
export async function prepareManagedImageFile(
  uri: string,
  fileName: string,
  mimeType: string
): Promise<ManagedAppFile> {
  return await stageExternalFile({
    kind: 'image',
    uri,
    fileName,
    mimeType,
    source: 'picker',
  });
}

/*确保根目录与 staging 目录在启动阶段就绪，减少首写时的抖动。 */
export async function ensureFileRuntimeReady(): Promise<void> {
  if (!getFileWorkspaceUserId()) {
    return;
  }
  await Promise.all([
    ensureDirectoryAsync(getRootDirectoryUri()),
    ensureDirectoryAsync(getFragmentsDirectoryUri()),
    ensureDirectoryAsync(getScriptsDirectoryUri()),
    ensureDirectoryAsync(getStagingDirectoryUri()),
    ensureDirectoryAsync(getStagingImageDirectoryUri()),
    ensureDirectoryAsync(getStagingAudioDirectoryUri()),
  ]);
}

export { getFragmentMetaPath };
