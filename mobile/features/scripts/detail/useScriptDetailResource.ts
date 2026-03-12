import { useCallback, useEffect, useState } from 'react';

import { fetchScriptDetail } from '@/features/scripts/api';
import type { Script } from '@/types/script';

interface UseScriptDetailResourceResult {
  script: Script | null;
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  commitRemoteScript: (script: Script) => Promise<void>;
  commitOptimisticScript: (script: Script) => Promise<void>;
}

export function useScriptDetailResource(scriptId?: string | null): UseScriptDetailResourceResult {
  /*封装脚本详情读取和本页 optimistic 可见态，避免页面层直接持有请求细节。 */
  const [script, setScript] = useState<Script | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(scriptId));
  const [error, setError] = useState<string | null>(null);

  const commitVisibleScript = useCallback(async (nextScript: Script) => {
    setScript(nextScript);
    setError(null);
  }, []);

  const loadRemote = useCallback(async () => {
    if (!scriptId) {
      setScript(null);
      setError('无效的口播稿 ID');
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const detail = await fetchScriptDetail(scriptId);
      setScript(detail);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [scriptId]);

  useEffect(() => {
    void loadRemote();
  }, [loadRemote]);

  return {
    script,
    isLoading,
    error,
    reload: loadRemote,
    commitRemoteScript: commitVisibleScript,
    commitOptimisticScript: commitVisibleScript,
  };
}
