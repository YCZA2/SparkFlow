import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeBodyHtml } from '@/features/fragments/bodyMarkdown';

const FRAGMENT_BODY_DRAFT_PREFIX = '@fragment_body_html_draft:';
const draftCache = new Map<string, string | null>();

interface FragmentBodyDraft {
  html: string;
  updated_at: string;
}

function buildDraftKey(fragmentId: string): string {
  /*按 fragment 维度隔离正文草稿。 */
  return `${FRAGMENT_BODY_DRAFT_PREFIX}${fragmentId}`;
}

export async function loadFragmentBodyDraft(fragmentId: string): Promise<string | null> {
  /*读取本地 HTML 正文草稿，异常时静默忽略。 */
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
    const html =
      typeof parsed.html === 'string'
        ? parsed.html
        : typeof (parsed as FragmentBodyDraft & { markdown?: string }).markdown === 'string'
          ? (parsed as FragmentBodyDraft & { markdown?: string }).markdown ?? null
          : null;
    const normalizedHtml = normalizeBodyHtml(html);
    draftCache.set(fragmentId, normalizedHtml);
    return normalizedHtml;
  } catch {
    draftCache.set(fragmentId, null);
    return null;
  }
}

export async function saveFragmentBodyDraft(fragmentId: string, html: string): Promise<void> {
  /*把最新 HTML 草稿持久化到本地，保证离页后可恢复。 */
  const normalizedHtml = normalizeBodyHtml(html);
  const payload: FragmentBodyDraft = {
    html: normalizedHtml,
    updated_at: new Date().toISOString(),
  };
  draftCache.set(fragmentId, normalizedHtml);
  await AsyncStorage.setItem(buildDraftKey(fragmentId), JSON.stringify(payload));
}

export async function clearFragmentBodyDraft(fragmentId: string): Promise<void> {
  /*当服务端同步成功后清除本地草稿。 */
  draftCache.delete(fragmentId);
  await AsyncStorage.removeItem(buildDraftKey(fragmentId));
}

export async function listFragmentBodyDraftIds(): Promise<string[]> {
  /*枚举远端碎片正文草稿，供后台同步队列恢复。 */
  const keys = await AsyncStorage.getAllKeys();
  return keys
    .filter((key) => key.startsWith(FRAGMENT_BODY_DRAFT_PREFIX))
    .map((key) => key.slice(FRAGMENT_BODY_DRAFT_PREFIX.length))
    .filter(Boolean);
}
