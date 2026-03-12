import { normalizeBodyHtml } from '@/features/fragments/bodyMarkdown';
import {
  clearRemoteBodyDraft,
  ensureFragmentLocalMirrorReady,
  listRemoteBodyDraftIds,
  readRemoteBodyDraft,
  writeRemoteBodyDraft,
} from '@/features/fragments/store/localMirror';

/*读取远端碎片的本地正文草稿，统一从文件层恢复未同步输入。 */
export async function loadFragmentBodyDraft(fragmentId: string): Promise<string | null> {
  await ensureFragmentLocalMirrorReady();
  const html = await readRemoteBodyDraft(fragmentId);
  return normalizeBodyHtml(html);
}

/*把远端碎片正文草稿写入文件层，供后台同步与离页恢复复用。 */
export async function saveFragmentBodyDraft(fragmentId: string, html: string): Promise<void> {
  await ensureFragmentLocalMirrorReady();
  await writeRemoteBodyDraft(fragmentId, normalizeBodyHtml(html));
}

/*当远端正文同步成功后清理草稿文件，让基线重新回到远端镜像。 */
export async function clearFragmentBodyDraft(fragmentId: string): Promise<void> {
  await ensureFragmentLocalMirrorReady();
  await clearRemoteBodyDraft(fragmentId);
}

/*枚举仍存在未同步正文草稿的远端碎片 id。 */
export async function listFragmentBodyDraftIds(): Promise<string[]> {
  await ensureFragmentLocalMirrorReady();
  return await listRemoteBodyDraftIds();
}
