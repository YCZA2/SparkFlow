import { useCallback, useEffect, useState } from 'react';

import { captureTaskExecutionScope } from '@/features/auth/taskScope';
import { readLocalScriptEntity, updateLocalScriptEntity } from '@/features/scripts/store';
import { hydrateGeneratedScriptToLocal } from '@/features/scripts/sync';
import {
  setScriptDetailQueryData,
  useLocalScriptDetailQuery,
} from '@/features/scripts/queries';
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
  /*封装脚本详情的 query 读取与远端缺失回补，避免页面层关心持久化来源。 */
  const query = useLocalScriptDetailQuery(scriptId);
  const [isHydrating, setIsHydrating] = useState(false);
  const [reloadError, setReloadError] = useState<string | null>(null);
  const script = query.data ?? null;

  const commitVisibleScript = useCallback(async (nextScript: Script) => {
    setScriptDetailQueryData(nextScript);
  }, []);

  const commitPersistedScript = useCallback(async (nextScript: Script) => {
    /*确认态统一回写本地实体，保证详情与持久层保持同源。 */
    await updateLocalScriptEntity(nextScript.id, nextScript);
    setScriptDetailQueryData(nextScript);
  }, []);

  const loadScript = useCallback(async () => {
    if (!scriptId) {
      return;
    }

    setReloadError(null);
    setIsHydrating(true);
    try {
      const localDetail = await readLocalScriptEntity(scriptId);
      if (localDetail) {
        setScriptDetailQueryData(localDetail);
        return;
      }
      const scope = captureTaskExecutionScope();
      const hydrated = await hydrateGeneratedScriptToLocal(scriptId, { scope });
      setScriptDetailQueryData(hydrated);
    } catch (err) {
      const message = getErrorMessage(err, '加载失败');
      setReloadError(message);
      throw new Error(message);
    } finally {
      setIsHydrating(false);
    }
  }, [scriptId]);

  useEffect(() => {
    /*本地缺失的脚本详情在首屏自动补一次远端 hydration，保持生成后首开可用。 */
    if (!scriptId || query.isPending || query.error || query.data) {
      return;
    }
    void loadScript().catch(() => {
      /*自动 hydration 失败时把错误留给 hook 状态展示，避免未处理 Promise。 */
    });
  }, [loadScript, query.data, query.error, query.isPending, scriptId]);

  const error =
    !scriptId
      ? '无效的口播稿 ID'
      : query.error
        ? getErrorMessage(query.error, '加载失败')
        : reloadError
          ? reloadError
        : query.isFetched && !script
          ? '口播稿不存在'
          : null;

  return {
    script,
    isLoading: Boolean(scriptId) && (query.isPending || isHydrating),
    error,
    reload: loadScript,
    commitPersistedScript,
    commitOptimisticScript: commitVisibleScript,
  };
}
