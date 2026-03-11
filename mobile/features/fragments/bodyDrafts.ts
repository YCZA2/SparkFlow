import AsyncStorage from '@react-native-async-storage/async-storage';

const FRAGMENT_BODY_DRAFT_PREFIX = '@fragment_body_markdown_draft:';
const draftCache = new Map<string, string | null>();

interface FragmentBodyDraft {
  markdown: string;
  updated_at: string;
}

function buildDraftKey(fragmentId: string): string {
  /** 中文注释：按 fragment 维度隔离正文草稿。 */
  return `${FRAGMENT_BODY_DRAFT_PREFIX}${fragmentId}`;
}

export async function loadFragmentBodyDraft(fragmentId: string): Promise<string | null> {
  /** 中文注释：读取本地 Markdown 正文草稿，异常时静默忽略。 */
  if (draftCache.has(fragmentId)) {
    return draftCache.get(fragmentId) ?? null;
  }
  try {
    const raw = await AsyncStorage.getItem(buildDraftKey(fragmentId));
    if (!raw) {
      draftCache.set(fragmentId, null);
      return null;
    }
    const parsed = JSON.parse(raw) as FragmentBodyDraft;
    const markdown = typeof parsed.markdown === 'string' ? parsed.markdown : null;
    draftCache.set(fragmentId, markdown);
    return markdown;
  } catch {
    draftCache.set(fragmentId, null);
    return null;
  }
}

export async function saveFragmentBodyDraft(fragmentId: string, markdown: string): Promise<void> {
  /** 中文注释：把最新 Markdown 草稿持久化到本地，保证离页后可恢复。 */
  const payload: FragmentBodyDraft = {
    markdown,
    updated_at: new Date().toISOString(),
  };
  draftCache.set(fragmentId, markdown);
  await AsyncStorage.setItem(buildDraftKey(fragmentId), JSON.stringify(payload));
}

export async function clearFragmentBodyDraft(fragmentId: string): Promise<void> {
  /** 中文注释：当服务端同步成功后清除本地草稿。 */
  draftCache.delete(fragmentId);
  await AsyncStorage.removeItem(buildDraftKey(fragmentId));
}
