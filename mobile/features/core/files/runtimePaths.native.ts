import { Directory, File, Paths } from 'expo-file-system';

import { sanitizeWorkspaceId } from '@/features/core/workspaceId';

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

export interface ManagedNativeFile {
  uri: string;
  name: string;
  parentDirectoryUri: string;
}

export interface NativeDirectoryHandle {
  uri: string;
  exists: boolean;
  create: (options?: { idempotent?: boolean; intermediates?: boolean; overwrite?: boolean }) => void;
  delete: () => void;
  list: () => (Directory | File)[];
}

export interface NativeFileHandle extends ManagedNativeFile {
  exists: boolean;
  create: (options?: { intermediates?: boolean; overwrite?: boolean }) => void;
  write: (content: string | Uint8Array, options?: { encoding?: 'utf8' | 'base64' }) => void;
  text: () => Promise<string>;
  delete: () => void;
  copy: (destination: Directory | File) => void;
  size: number | null;
}

let currentWorkspaceUserId: string | null = null;

/*确保目录 URI 以 `/` 结尾，避免字符串拼接时出现歧义。 */
export function ensureTrailingSlash(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`;
}

/*把 expo-file-system Directory 规整成统一 handle 接口。 */
export function toDirectoryHandle(directory: Directory): NativeDirectoryHandle {
  return directory as unknown as NativeDirectoryHandle;
}

/*把 expo-file-system File 规整成统一 handle 接口。 */
export function toFileHandle(file: File): NativeFileHandle {
  return file as unknown as NativeFileHandle;
}

/*读取当前文件 runtime 所属工作区，便于上层做守卫。 */
export function getFileWorkspaceUserId(): string | null {
  return currentWorkspaceUserId;
}

/*切换当前文件工作区，让正文和媒体都落到对应账号目录下。 */
export function setFileRuntimeWorkspace(userId: string | null): void {
  currentWorkspaceUserId = userId;
}

/*当前文件 runtime 只服务登录后的账号工作区。 */
function requireWorkspaceUserId(): string {
  if (!currentWorkspaceUserId) {
    throw new Error('当前未挂载登录工作区，无法访问本地文件');
  }
  return currentWorkspaceUserId;
}

/*返回工作区根目录，统一作为正文与 staging 的父级。 */
export function getRootDirectoryUri(): string {
  return ensureTrailingSlash(
    `${toDirectoryHandle(new Directory(Paths.document, 'sparkflow', 'workspaces', sanitizeWorkspaceId(requireWorkspaceUserId()))).uri}`
  );
}

/*返回 fragment 正文与素材目录根路径。 */
export function getFragmentsDirectoryUri(): string {
  return `${getRootDirectoryUri()}fragments/`;
}

/*返回 script 正文目录根路径。 */
export function getScriptsDirectoryUri(): string {
  return `${getRootDirectoryUri()}scripts/`;
}

/*返回 staging 根目录，统一承接临时媒体文件。 */
export function getStagingDirectoryUri(): string {
  return ensureTrailingSlash(
    `${toDirectoryHandle(new Directory(Paths.cache, 'sparkflow', 'workspaces', sanitizeWorkspaceId(requireWorkspaceUserId()), 'staging')).uri}`
  );
}

/*返回 staging 图片目录。 */
export function getStagingImageDirectoryUri(): string {
  return `${getStagingDirectoryUri()}images/`;
}

/*返回 staging 音频目录。 */
export function getStagingAudioDirectoryUri(): string {
  return `${getStagingDirectoryUri()}audio/`;
}

/*把输入名称规整为稳定文件名，避免空格与特殊字符污染路径。 */
export function sanitizeFileName(name: string, fallback: string): string {
  const trimmed = String(name || '').trim();
  const normalized = trimmed.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
  return normalized || fallback;
}

/*按片段 id 生成持久化目录，统一承接正文与元信息文件。 */
export function getFragmentDirectoryUri(fragmentId: string): string {
  return `${getFragmentsDirectoryUri()}${fragmentId}/`;
}

/*按 script id 生成持久化目录，统一承接成稿正文文件。 */
export function getScriptDirectoryUri(scriptId: string): string {
  return `${getScriptsDirectoryUri()}${scriptId}/`;
}

/*为单条片段创建 assets 子目录，统一承接恢复后的媒体本地缓存。 */
export function getFragmentAssetsDirectoryUri(fragmentId: string): string {
  return `${getFragmentDirectoryUri(fragmentId)}assets/`;
}

/*用 URI 构造受管文件句柄，统一文件接口形状。 */
export function createManagedNativeFile(parentDirectoryUri: string, fileName: string): ManagedNativeFile {
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

/*返回 script 正式正文文件句柄，供成稿 local-first 真值落盘。 */
export function getScriptBodyFile(scriptId: string): ManagedNativeFile {
  return createManagedNativeFile(getScriptDirectoryUri(scriptId), 'body.html');
}
