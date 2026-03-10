import { useEffect, useMemo, useRef, useState } from 'react';

import { updateFragment } from '@/features/fragments/api';
import { clearFragmentBodyDraft, loadFragmentBodyDraft, saveFragmentBodyDraft } from '@/features/fragments/bodyDrafts';
import type { Fragment } from '@/types/fragment';

const AUTOSAVE_DELAY_MS = 800;

type SyncStatus = 'idle' | 'syncing' | 'synced';

interface UseFragmentBodyEditorOptions {
  fragment: Fragment | null;
  onFragmentChange: (fragment: Fragment) => void;
}

function resolveEditorInitialText(fragment: Fragment | null): string {
  /** 中文注释：正文编辑器优先展示正文，没有正文时回退转写原文。 */
  if (!fragment) return '';
  return fragment.compiled_markdown ?? fragment.transcript ?? '';
}

export function useFragmentBodyEditor({ fragment, onFragmentChange }: UseFragmentBodyEditorOptions) {
  /** 中文注释：管理正文自动保存、本地草稿与服务端同步状态。 */
  const [text, setText] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const queuedTextRef = useRef<string | null>(null);
  const lastSyncedEditorTextRef = useRef('');

  const fragmentId = fragment?.id ?? null;
  const initialText = useMemo(() => resolveEditorInitialText(fragment), [fragment]);

  useEffect(() => {
    /** 中文注释：在切换 fragment 时优先恢复本地草稿。 */
    if (!fragmentId) {
      hydratedRef.current = false;
      setText('');
      setSyncStatus('idle');
      lastSyncedEditorTextRef.current = '';
      return;
    }
    let cancelled = false;
    void (async () => {
      const draft = await loadFragmentBodyDraft(fragmentId);
      if (cancelled) return;
      const hasMeaningfulDraft = draft !== null && draft !== initialText;
      const nextText = hasMeaningfulDraft ? draft : initialText;
      hydratedRef.current = true;
      lastSyncedEditorTextRef.current = initialText;
      setText(nextText);
      if (draft !== null && !hasMeaningfulDraft) {
        void clearFragmentBodyDraft(fragmentId).catch(() => {
          // 中文注释：清理陈旧草稿失败时不影响当前加载。
        });
      }
      setSyncStatus(hasMeaningfulDraft ? 'idle' : 'synced');
    })();
    return () => {
      cancelled = true;
    };
  }, [fragmentId]);

  useEffect(() => {
    /** 中文注释：正文变更后先写本地草稿，保证失败或离页后可恢复。 */
    if (!fragmentId || !hydratedRef.current) return;
    if (text === lastSyncedEditorTextRef.current) return;
    void saveFragmentBodyDraft(fragmentId, text).catch(() => {
      // 中文注释：本地持久化失败时不打断编辑流程。
    });
  }, [fragmentId, text]);

  useEffect(() => {
    /** 中文注释：输入停顿后自动向服务端提交正文变更。 */
    if (!fragmentId || !fragment || !hydratedRef.current) return;
    if (text === lastSyncedEditorTextRef.current) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      void submitLatestText(text);
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [fragment, fragmentId, text]);

  async function submitLatestText(nextText: string): Promise<void> {
    /** 中文注释：串行化正文保存请求，只保留最后一次输入结果。 */
    if (!fragmentId) return;
    if (inFlightRef.current) {
      queuedTextRef.current = nextText;
      return;
    }
    if (nextText === lastSyncedEditorTextRef.current) {
      return;
    }
    inFlightRef.current = true;
    setSyncStatus('syncing');
    try {
      const updated = await updateFragment(fragmentId, { body_markdown: nextText });
      onFragmentChange(updated);
      lastSyncedEditorTextRef.current = nextText;
      if (queuedTextRef.current === null || queuedTextRef.current === nextText) {
        await clearFragmentBodyDraft(fragmentId);
      }
      setSyncStatus('synced');
    } catch {
      setSyncStatus('idle');
    } finally {
      inFlightRef.current = false;
      const queuedText = queuedTextRef.current;
      queuedTextRef.current = null;
      if (queuedText !== null && queuedText !== lastSyncedEditorTextRef.current) {
        void submitLatestText(queuedText);
      }
    }
  }

  function handleChange(nextText: string): void {
    /** 中文注释：同步更新编辑器文本状态，交由自动保存 effect 处理提交。 */
    setText(nextText);
    if (syncStatus === 'synced') {
      setSyncStatus('idle');
    }
  }

  const statusLabel = syncStatus === 'syncing' ? '同步中' : syncStatus === 'synced' ? '已同步' : null;

  return {
    text,
    statusLabel,
    onChangeText: handleChange,
  };
}
