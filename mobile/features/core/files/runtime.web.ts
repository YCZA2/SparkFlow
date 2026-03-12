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

interface ManagedWebFile {
  uri: string;
  name: string;
}

function createWebFile(uri: string): ManagedWebFile {
  const segments = uri.split('/');
  return {
    uri,
    name: segments[segments.length - 1] || 'file',
  };
}

/*Web 端用内存占位文件句柄维持接口兼容，避免启动时触发 native 文件系统。 */
export function getFragmentBodyFile(fragmentId: string): ManagedWebFile {
  return createWebFile(`web://fragments/${fragmentId}/body.html`);
}

/*Web 端为草稿文件返回稳定占位路径，让静态渲染阶段保持可解析。 */
export function getFragmentDraftBodyFile(fragmentId: string): ManagedWebFile {
  return createWebFile(`web://fragments/${fragmentId}/meta/draft.html`);
}

/*Web 端返回占位 meta 路径，供调试信息和路由静态渲染使用。 */
export function getFragmentMetaPath(fragmentId: string): string {
  return `web://fragments/${fragmentId}/meta`;
}

/*Web 端不持久化文件内容，统一返回传入路径占位。 */
export async function writeTextFile(file: ManagedWebFile, content: string): Promise<string> {
  void content;
  return file.uri;
}

/*Web 端没有本地文件镜像，读取时始终回退为空。 */
export async function readTextFile(file: ManagedWebFile): Promise<string | null> {
  void file;
  return null;
}

/*Web 端跳过文件删除，避免无意义的 native 文件 API 调用。 */
export async function deleteFileIfExists(file: ManagedWebFile): Promise<void> {
  void file;
}

/*Web 端正文镜像写入降级为空操作，只保留接口形状。 */
export async function writeFragmentBodyFile(fragmentId: string, html: string): Promise<string> {
  return await writeTextFile(getFragmentBodyFile(fragmentId), html);
}

/*Web 端正文镜像读取统一返回空，交给远端数据源兜底。 */
export async function readFragmentBodyFile(fragmentId: string): Promise<string | null> {
  return await readTextFile(getFragmentBodyFile(fragmentId));
}

/*Web 端草稿写入降级为空操作，避免阻断路由渲染。 */
export async function writeFragmentDraftBodyFile(fragmentId: string, html: string): Promise<string> {
  return await writeTextFile(getFragmentDraftBodyFile(fragmentId), html);
}

/*Web 端没有落地草稿文件，统一返回空。 */
export async function readFragmentDraftBodyFile(fragmentId: string): Promise<string | null> {
  return await readTextFile(getFragmentDraftBodyFile(fragmentId));
}

/*Web 端草稿删除降级为空操作。 */
export async function clearFragmentDraftBodyFile(fragmentId: string): Promise<void> {
  await deleteFileIfExists(getFragmentDraftBodyFile(fragmentId));
}

/*Web 端不恢复本地正文草稿队列，直接返回空列表。 */
export async function listFragmentDraftBodyIds(): Promise<string[]> {
  return [];
}

/*Web 端直接复用输入 URI，避免依赖 native staging 目录。 */
export async function stageExternalFile(input: {
  kind: ManagedAppFileKind;
  uri: string;
  fileName: string;
  mimeType: string;
  source: ManagedAppFileSource;
}): Promise<ManagedAppFile> {
  return {
    uri: input.uri,
    name: input.fileName,
    mimeType: input.mimeType,
    size: 0,
    kind: input.kind,
    source: input.source,
  };
}

/*Web 端上传同样返回标准 multipart 描述，交给 fetch/FormData 处理。 */
export function buildMultipartFilePart(file: ManagedAppFile): { uri: string; name: string; type: string } {
  return {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  };
}

/*Web 端音频文件保持原始 URI，避免触碰 native 文件系统。 */
export async function prepareManagedAudioFile(
  uri: string,
  fileName = 'recording.m4a',
  mimeType = 'audio/m4a',
  source: ManagedAppFileSource = 'recording'
): Promise<ManagedAppFile> {
  return await stageExternalFile({
    kind: 'audio',
    uri,
    fileName,
    mimeType,
    source,
  });
}

/*Web 端图片文件保持原始 URI，保证上传流程仍可构造 form-data。 */
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

/*Web 启动阶段跳过文件目录预热，避免静态渲染加载 native 模块。 */
export async function ensureFileRuntimeReady(): Promise<void> {
  return;
}
