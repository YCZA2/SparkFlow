import { useState } from 'react';
import { generateScript } from '@/services/scripts';
import type { ScriptMode } from '@/types/script';

export function useGenerateScript() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const run = async (fragmentIds: string[], mode: ScriptMode) => {
    try {
      setStatus('loading');
      setError(null);
      const script = await generateScript({
        fragment_ids: fragmentIds,
        mode,
      });
      setStatus('success');
      return script;
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : '生成失败');
      throw err;
    }
  };

  return {
    status,
    error,
    run,
  };
}
