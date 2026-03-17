import { Directory, File, Paths } from 'expo-file-system';

export type ManagedAppFileKind = 'audio' | 'image' | 'text';
export type ManagedAppFileSource = 'backup-cache' | 'draft' | 'staging' | 'picker' | 'recording';

export interface ManagedAppFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  kind: ManagedAppFileKind;
  source: ManagedAppFileSource;
}

interface ManagedNativeFile {
  uri: string;
  name: string;
  parentDirectoryUri: string;
}

interface NativeDirectoryHandle {
  uri: string;
  exists: boolean;
  create: (options?: { idempotent?: boolean; intermediates?: boolean; overwrite?: boolean }) => void;
  delete: () => void;
  list: () => (Directory | File)[];
}

interface NativeFileHandle extends ManagedNativeFile {
  exists: boolean;
  create: (options?: { intermediates?: boolean; overwrite?: boolean }) => void;
  write: (content: string | Uint8Array, options?: { encoding?: 'utf8' | 'base64' }) => void;
  text: () => Promise<string>;
  delete: () => void;
  copy: (destination: Directory | File) => void;
  size: number | null;
}

const ROOT_DIRECTORY = new Directory(Paths.document, 'sparkflow');
const FRAGMENTS_DIRECTORY = new Directory(ROOT_DIRECTORY, 'fragments');
const STAGING_DIRECTORY = new Directory(Paths.cache, 'sparkflow', 'staging');
const STAGING_IMAGE_DIRECTORY = new Directory(STAGING_DIRECTORY, 'images');
const STAGING_AUDIO_DIRECTORY = new Directory(STAGING_DIRECTORY, 'audio');

const ROOT_DIRECTORY_URI = `${toDirectoryHandle(ROOT_DIRECTORY).uri}`;
const FRAGMENTS_DIRECTORY_URI = `${toDirectoryHandle(FRAGMENTS_DIRECTORY).uri}`;
const STAGING_DIRECTORY_URI = `${toDirectoryHandle(STAGING_DIRECTORY).uri}`;
const STAGING_IMAGE_DIRECTORY_URI = `${STAGING_DIRECTORY_URI}images/`;
const STAGING_AUDIO_DIRECTORY_URI = `${STAGING_DIRECTORY_URI}audio/`;

/*确保目录 URI 以 `/` 结尾，避免字符串拼接时出现歧义。 */
function ensureTrailingSlash(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`;
}

/*确保目标目录存在，避免文件读写时反复做空判断。 */
function toDirectoryHandle(directory: Directory): NativeDirectoryHandle {
  return directory as unknown as NativeDirectoryHandle;
}

function toFileHandle(file: File): NativeFileHandle {
  return file as unknown as NativeFileHandle;
}

function ensureDirectoryAsync(directoryUri: string): Promise<string> {
  const normalizedUri = ensureTrailingSlash(directoryUri);
  const directory = toDirectoryHandle(new Directory(normalizedUri));
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return Promise.resolve(normalizedUri);
}

/*把输入名称规整为稳定文件名，避免空格与特殊字符污染路径。 */
function sanitizeFileName(name: string, fallback: string): string {
  const trimmed = String(name || '').trim();
  const normalized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  return normalized || fallback;
}

/*按片段 id 生成持久化目录，统一承接正文与元信息文件。 */
function getFragmentDirectoryUri(fragmentId: string): string {
  return `${FRAGMENTS_DIRECTORY_URI}${fragmentId}/`;
}

/*为单条片段创建 meta 子目录，用于放置草稿和辅助文件。 */
function getFragmentMetaDirectoryUri(fragmentId: string): string {
  return `${getFragmentDirectoryUri(fragmentId)}meta/`;
}

/*为单条片段创建 assets 子目录，统一承接恢复后的媒体本地缓存。 */
function getFragmentAssetsDirectoryUri(fragmentId: string): string {
  return `${getFragmentDirectoryUri(fragmentId)}assets/`;
}

/*用 URI 构造受管文件句柄，统一文件接口形状。 */
function createManagedNativeFile(parentDirectoryUri: string, fileName: string): ManagedNativeFile {
  const normalizedParentUri = ensureTrailingSlash(parentDirectoryUri);
  return {
    uri: `${normalizedParentUri}${fileName}`,
    name: fileName,
    parentDirectoryUri: normalizedParentUri,
  };
}

/*返回片段正式正文文件句柄，供本地镜像持久化基线正文。 */
export function getFragmentBodyFile(fragmentId: string): ManagedNativeFile {
  return createManagedNativeFile(getFragmentDirectoryUri(fragmentId), 'body.html');
}

/*返回兼容草稿正文文件句柄，供未持久化输入临时落盘。 */
export function getFragmentDraftBodyFile(fragmentId: string): ManagedNativeFile {
  return createManagedNativeFile(getFragmentMetaDirectoryUri(fragmentId), 'draft.html');
}

/*返回片段目录下的元数据目录，便于后续扩展调试文件。 */
export function getFragmentMetaPath(fragmentId: string): string {
  return getFragmentMetaDirectoryUri(fragmentId);
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
  await ensureDirectoryAsync(FRAGMENTS_DIRECTORY_URI);
  const entries = toDirectoryHandle(FRAGMENTS_DIRECTORY).list();
  return entries
    .filter((entry): entry is Directory => entry instanceof Directory)
    .map((directory) => directory.name)
    .filter((fragmentId) => toFileHandle(new File(getFragmentDraftBodyFile(fragmentId).uri)).exists);
}

/*递归清空 fragments 目录，供显式恢复时重建本地正文文件使用。 */
export async function resetFragmentFiles(): Promise<void> {
  await ensureDirectoryAsync(FRAGMENTS_DIRECTORY_URI);

  const deleteDirectoryRecursively = (directory: Directory): void => {
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
  };

  for (const entry of toDirectoryHandle(FRAGMENTS_DIRECTORY).list()) {
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
  const targetDirectoryUri = input.kind === 'audio'
    ? await ensureDirectoryAsync(STAGING_AUDIO_DIRECTORY_URI)
    : await ensureDirectoryAsync(STAGING_IMAGE_DIRECTORY_URI);
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
  const normalizedName = sanitizeFileName(
    fileName ?? uri.split('/').pop() ?? 'recording.m4a',
    'recording.m4a'
  );
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
  await Promise.all([
    ensureDirectoryAsync(ROOT_DIRECTORY_URI),
    ensureDirectoryAsync(FRAGMENTS_DIRECTORY_URI),
    ensureDirectoryAsync(STAGING_DIRECTORY_URI),
    ensureDirectoryAsync(STAGING_IMAGE_DIRECTORY_URI),
    ensureDirectoryAsync(STAGING_AUDIO_DIRECTORY_URI),
  ]);
}
