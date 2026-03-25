/*把 user_id 规整为安全的文件名或路径片段，避免工作区路径出现特殊字符。 */
export function sanitizeWorkspaceId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]+/g, '-');
}
