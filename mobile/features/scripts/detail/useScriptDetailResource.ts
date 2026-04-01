import { useCallback, useEffect, useRef, useState } from 'react';

import { captureTaskExecutionScope } from '@/features/auth/taskScope';
import { readLocalScriptEntity, updateLocalScriptEntity } from '@/features/scripts/store';
import { useScriptStore } from '@/features/scripts/store/scriptStore';
import { syncRemoteScriptDetailToLocal } from '@/features/scripts/sync';
import type { Script } from '@/types/script';
import { getErrorMessage } from '@/utils/error';

interface UseScriptDetailResourceResult {
  script: Script | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  commitPersistedScript: (script: Script) => Promise<void>;
  commitOptimisticScript: (script: Script) => Promise<void>;
}

export function useScriptDetailResource(scriptId?: string | null): UseScriptDetailResourceResult {
  /*封装脚本详情的本地读取与远端缺失回补，避免页面层关心持久化来源。 */
  const [script, setScript] = useState<Script | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(scriptId));
  const [error, setError] = useState<string | null>(null);
  const hasVisibleScriptRef = useRef(false);

  const commitVisibleScript = useCallback(async (nextScript: Script) => {
    hasVisibleScriptRef.current = true;
    setScript(nextScript);
    setError(null);
  }, []);

  const commitPersistedScript = useCallback(async (nextScript: Script) => {
    /*确认态统一回写本地实体，保证详情与持久层保持同源。 */
    hasVisibleScriptRef.current = true;
    setScript(nextScript);
    setError(null);
    await updateLocalScriptEntity(nextScript.id, nextScript);
  }, []);

  const loadScript = useCallback(async () => {
    if (!scriptId) {
      setScript(null);
      setError('无效的口播稿 ID');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const localDetail = await readLocalScriptEntity(scriptId);
      if (localDetail) {
        hasVisibleScriptRef.current = true;
        setScript(localDetail);
        return;
      }
      const scope = captureTaskExecutionScope();
      const hydrated = await syncRemoteScriptDetailToLocal(scriptId, { scope });
      hasVisibleScriptRef.current = true;
      setScript(hydrated);
    } catch (err) {
      setError(getErrorMessage(err, '加载失败'));
    } finally {
      setIsLoading(false);
    }
  }, [scriptId]);

  useEffect(() => {
    if (!scriptId) {
      hasVisibleScriptRef.current = false;
      setScript(null);
      setError('无效的口播稿 ID');
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const cached = await readLocalScriptEntity(scriptId);
      if (cancelled) return;
      if (cached) {
        hasVisibleScriptRef.current = true;
        setScript(cached);
        setError(null);
        setIsLoading(false);
        return;
      }
      await loadScript();
    })();

    const unsubscribe = useScriptStore.subscribe(() => {
      void (async () => {
        const cached = await readLocalScriptEntity(scriptId);
        if (!cached || cancelled) return;
        hasVisibleScriptRef.current = true;
        setScript(cached);
        setError(null);
        setIsLoading(false);
      })();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadScript, scriptId]);

  return {
    script,
    isLoading,
    error,
    reload: loadScript,
    commitPersistedScript,
    commitOptimisticScript: commitVisibleScript,
  };
}
