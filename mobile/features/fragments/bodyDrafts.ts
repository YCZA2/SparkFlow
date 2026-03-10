import AsyncStorage from '@react-native-async-storage/async-storage';

const FRAGMENT_BODY_DRAFT_PREFIX = '@fragment_body_draft:';

interface FragmentBodyDraft {
  text: string;
  updated_at: string;
}

function buildDraftKey(fragmentId: string): string {
  /** 中文注释：按 fragment 维度隔离正文草稿。 */
  return `${FRAGMENT_BODY_DRAFT_PREFIX}${fragmentId}`;
}

export async function loadFragmentBodyDraft(fragmentId: string): Promise<string | null> {
  /** 中文注释：读取本地正文草稿，异常时静默忽略。 */
  try {
    const raw = await AsyncStorage.getItem(buildDraftKey(fragmentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FragmentBodyDraft;
    return typeof parsed.text === 'string' ? parsed.text : null;
  } catch {
    return null;
  }
}

export async function saveFragmentBodyDraft(fragmentId: string, text: string): Promise<void> {
  /** 中文注释：把最新正文草稿持久化到本地，保证离页后可恢复。 */
  const payload: FragmentBodyDraft = {
    text,
    updated_at: new Date().toISOString(),
  };
  await AsyncStorage.setItem(buildDraftKey(fragmentId), JSON.stringify(payload));
}

export async function clearFragmentBodyDraft(fragmentId: string): Promise<void> {
  /** 中文注释：当服务端同步成功后清除本地草稿。 */
  await AsyncStorage.removeItem(buildDraftKey(fragmentId));
}
