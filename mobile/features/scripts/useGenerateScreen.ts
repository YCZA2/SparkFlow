import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useSelectedFragments } from '@/features/fragments/hooks';
import { useGenerateScript } from '@/features/scripts/hooks';
import type { Fragment } from '@/types/fragment';
import type { ScriptMode } from '@/types/script';

function displayFragmentText(fragment: Fragment): string {
  if (fragment.summary) return fragment.summary;
  if (fragment.transcript) return fragment.transcript.slice(0, 80);
  return '无内容';
}

export interface GenerateScreenState {
  ids: string[];
  fragments: Fragment[];
  isLoading: boolean;
  error: string | null;
  mode: ScriptMode;
  modeOptions: Array<{ value: ScriptMode; title: string; description: string }>;
  generator: ReturnType<typeof useGenerateScript>;
  canGenerate: boolean;
  selectedSummary: string;
  getFragmentDisplayText: (fragment: Fragment) => string;
  setMode: (mode: ScriptMode) => void;
  generate: () => Promise<void>;
  goBack: () => void;
}

export function useGenerateScreen(): GenerateScreenState {
  const router = useRouter();
  const { fragmentIds } = useLocalSearchParams<{ fragmentIds?: string | string[] }>();
  const { ids, fragments, isLoading, error } = useSelectedFragments(fragmentIds);
  const [mode, setMode] = useState<ScriptMode>('mode_a');
  const generator = useGenerateScript();

  /**
   * 中文注释：提交脚本生成任务，并在 pipeline 成功后跳转详情页。
   */
  const generate = useCallback(async () => {
    if (ids.length === 0) {
      Alert.alert('无法生成', '未接收到选中的碎片');
      return;
    }

    try {
      const scriptId = await generator.run(ids, mode);
      router.replace(`/script/${scriptId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : '生成失败';
      Alert.alert('生成失败', message);
    }
  }, [generator, ids, mode, router]);

  const modeOptions = useMemo(
    () => [
      { value: 'mode_a' as const, title: '导师爆款模式', description: '黄金结构，节奏强，适合直接拍摄' },
      { value: 'mode_b' as const, title: '我的专属二脑', description: '更自然，贴近个人表达习惯' },
    ],
    []
  );

  return {
    ids,
    fragments,
    isLoading,
    error,
    mode,
    modeOptions,
    generator,
    canGenerate: ids.length > 0 && generator.status !== 'loading',
    selectedSummary: `已选碎片（${ids.length}）`,
    getFragmentDisplayText: displayFragmentText,
    setMode,
    generate,
    goBack: () => router.back(),
  };
}
