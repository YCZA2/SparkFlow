import AsyncStorage from '@react-native-async-storage/async-storage';

const FRAGMENT_BODY_DRAFT_PREFIX = '@fragment_body_draft:';

interface FragmentBodyDraft {
  document: unknown;
  updated_at: string;
}

function buildDraftKey(fragmentId: string): string {
  /** 中文注释：按 fragment 维度隔离正文草稿。 */
  return `${FRAGMENT_BODY_DRAFT_PREFIX}${fragmentId}`;
}

export async function loadFragmentBodyDraft(fragmentId: string): Promise<unknown | null> {
  /** 中文注释：读取本地正文草稿文档，异常时静默忽略。 */
  try {
    const raw = await AsyncStorage.getItem(buildDraftKey(fragmentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FragmentBodyDraft;
    return parsed.document ?? null;
  } catch {
    return null;
  }
}

export async function saveFragmentBodyDraft(fragmentId: string, document: unknown): Promise<void> {
  /** 中文注释：把最新正文草稿文档持久化到本地，保证离页后可恢复。 */
  const payload: FragmentBodyDraft = {
    document,
    updated_at: new Date().toISOString(),
  };
  await AsyncStorage.setItem(buildDraftKey(fragmentId), JSON.stringify(payload));
}

export async function clearFragmentBodyDraft(fragmentId: string): Promise<void> {
  /** 中文注释：当服务端同步成功后清除本地草稿。 */
  await AsyncStorage.removeItem(buildDraftKey(fragmentId));
}
