import { Directory, File, Paths } from 'expo-file-system';

export type ManagedAppFileKind = 'audio' | 'image' | 'text';
export type ManagedAppFileSource = 'remote-mirror' | 'draft' | 'staging' | 'picker' | 'recording';

export interface ManagedAppFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
  kind: ManagedAppFileKind;
  source: ManagedAppFileSource;
}

const ROOT_DIRECTORY = new Directory(Paths.document, 'sparkflow');
const FRAGMENTS_DIRECTORY = new Directory(ROOT_DIRECTORY, 'fragments');
const STAGING_DIRECTORY = new Directory(Paths.cache, 'sparkflow', 'staging');
const STAGING_IMAGE_DIRECTORY = new Directory(STAGING_DIRECTORY, 'images');
const STAGING_AUDIO_DIRECTORY = new Directory(STAGING_DIRECTORY, 'audio');

/*确保目标目录存在，避免文件读写时反复做空判断。 */
function ensureDirectory(directory: Directory): Directory {
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return directory;
}

/*把输入名称规整为稳定文件名，避免空格与特殊字符污染路径。 */
function sanitizeFileName(name: string, fallback: string): string {
  const trimmed = String(name || '').trim();
  const normalized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  return normalized || fallback;
}

/*按片段 id 生成持久化目录，统一承接正文与元信息文件。 */
function getFragmentDirectory(fragmentId: string): Directory {
  return ensureDirectory(new Directory(FRAGMENTS_DIRECTORY, fragmentId));
}

/*为单条片段创建 meta 子目录，用于放置草稿和辅助文件。 */
function getFragmentMetaDirectory(fragmentId: string): Directory {
  return ensureDirectory(new Directory(getFragmentDirectory(fragmentId), 'meta'));
}

/*返回片段正式正文文件句柄，供本地镜像持久化基线正文。 */
export function getFragmentBodyFile(fragmentId: string): File {
  return new File(getFragmentDirectory(fragmentId), 'body.html');
}

/*返回远端正文草稿文件句柄，供未同步编辑内容临时落盘。 */
export function getFragmentDraftBodyFile(fragmentId: string): File {
  return new File(getFragmentMetaDirectory(fragmentId), 'draft.html');
}

/*返回片段目录下的元数据目录，便于后续扩展调试文件。 */
export function getFragmentMetaPath(fragmentId: string): string {
  return getFragmentMetaDirectory(fragmentId).uri;
}

/*把文本写入指定文件，并确保父目录已提前准备好。 */
export async function writeTextFile(file: File, content: string): Promise<string> {
  ensureDirectory(file.parentDirectory);
  if (!file.exists) {
    file.create({ intermediates: true, overwrite: true });
  }
  file.write(content);
  return file.uri;
}

/*读取文本文件内容，文件缺失时返回 null 而不是抛异常。 */
export async function readTextFile(file: File): Promise<string | null> {
  if (!file.exists) {
    return null;
  }
  return await file.text();
}

/*删除指定文件，供草稿清理和同步成功后的回收使用。 */
export async function deleteFileIfExists(file: File): Promise<void> {
  if (!file.exists) {
    return;
  }
  file.delete();
}

/*把正式正文写入片段目录，供详情与列表镜像消费。 */
export async function writeFragmentBodyFile(fragmentId: string, html: string): Promise<string> {
  return await writeTextFile(getFragmentBodyFile(fragmentId), html);
}

/*读取片段正式正文，缺失时回退到空内容。 */
export async function readFragmentBodyFile(fragmentId: string): Promise<string | null> {
  return await readTextFile(getFragmentBodyFile(fragmentId));
}

/*把远端正文草稿写到 meta 目录，避免污染正式基线文件。 */
export async function writeFragmentDraftBodyFile(fragmentId: string, html: string): Promise<string> {
  return await writeTextFile(getFragmentDraftBodyFile(fragmentId), html);
}

/*读取远端正文草稿，供编辑器 hydrate 优先恢复最近输入。 */
export async function readFragmentDraftBodyFile(fragmentId: string): Promise<string | null> {
  return await readTextFile(getFragmentDraftBodyFile(fragmentId));
}

/*清理远端正文草稿文件，让同步成功后的状态回到干净基线。 */
export async function clearFragmentDraftBodyFile(fragmentId: string): Promise<void> {
  await deleteFileIfExists(getFragmentDraftBodyFile(fragmentId));
}

/*枚举当前本地存在正文草稿的片段 id，用于启动时恢复同步。 */
export async function listFragmentDraftBodyIds(): Promise<string[]> {
  ensureDirectory(FRAGMENTS_DIRECTORY);
  const entries = FRAGMENTS_DIRECTORY.list();
  return entries
    .filter((entry): entry is Directory => entry instanceof Directory)
    .map((directory) => directory.name)
    .filter((fragmentId) => getFragmentDraftBodyFile(fragmentId).exists);
}

/*把外部 URI 复制到 staging 目录，统一转换成可控的 app sandbox 文件。 */
export async function stageExternalFile(input: {
  kind: ManagedAppFileKind;
  uri: string;
  fileName: string;
  mimeType: string;
  source: ManagedAppFileSource;
}): Promise<ManagedAppFile> {
  const targetDirectory = input.kind === 'audio'
    ? ensureDirectory(STAGING_AUDIO_DIRECTORY)
    : ensureDirectory(STAGING_IMAGE_DIRECTORY);
  const uniqueName = `${Date.now()}-${sanitizeFileName(input.fileName, input.kind === 'audio' ? 'audio.bin' : 'image.bin')}`;
  const targetFile = new File(targetDirectory, uniqueName);
  if (targetFile.exists) {
    targetFile.delete();
  }
  const sourceFile = new File(input.uri);
  sourceFile.copy(targetFile);
  return {
    uri: targetFile.uri,
    name: targetFile.name,
    mimeType: input.mimeType,
    size: targetFile.size,
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
  ensureDirectory(ROOT_DIRECTORY);
  ensureDirectory(FRAGMENTS_DIRECTORY);
  ensureDirectory(STAGING_DIRECTORY);
  ensureDirectory(STAGING_IMAGE_DIRECTORY);
  ensureDirectory(STAGING_AUDIO_DIRECTORY);
}
