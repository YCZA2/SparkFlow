import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useSelectedFragments } from '@/features/fragments/hooks';
import { useGenerateScript } from '@/features/scripts/hooks';
import type { Fragment } from '@/types/fragment';
import { getErrorMessage } from '@/utils/error';

function displayFragmentText(fragment: Fragment): string {
  /*生成页摘要优先显示正文，其次回退到转写原文。 */
  if (fragment.summary) return fragment.summary;
  if (fragment.plain_text_snapshot) return fragment.plain_text_snapshot.slice(0, 80);
  if (fragment.transcript) return fragment.transcript.slice(0, 80);
  return '无内容';
}

function buildSuggestedTopic(fragments: Fragment[]): string {
  /*从已选碎片里提炼一个可编辑的默认主题，避免生成页首开为空。 */
  const candidate = fragments
    .map((fragment) => fragment.summary || fragment.plain_text_snapshot || fragment.transcript || '')
    .map((text) => text.trim())
    .find((text) => text.length > 0);
  if (!candidate) {
    return '';
  }
  return candidate.slice(0, 30);
}

export interface GenerateScreenState {
  ids: string[];
  fragments: Fragment[];
  isLoading: boolean;
  error: string | null;
  topic: string;
  generator: ReturnType<typeof useGenerateScript>;
  canGenerate: boolean;
  selectedSummary: string;
  getFragmentDisplayText: (fragment: Fragment) => string;
  setTopic: (topic: string) => void;
  generate: () => Promise<void>;
  goBack: () => void;
}

export function useGenerateScreen(): GenerateScreenState {
  const router = useRouter();
  const { fragmentIds } = useLocalSearchParams<{ fragmentIds?: string | string[] }>();
  const { ids, fragments, isLoading, error } = useSelectedFragments(fragmentIds);
  const [topic, setTopic] = useState('');
  const generator = useGenerateScript();

  useEffect(() => {
    /*仅在首次拿到碎片时填入推荐主题，避免覆盖用户手动输入。 */
    if (topic.trim()) {
      return;
    }
    const suggested = buildSuggestedTopic(fragments);
    if (suggested) {
      setTopic(suggested);
    }
  }, [fragments, topic]);

  /**
   提交脚本生成任务，并在任务成功后跳转详情页。
   */
  const generate = useCallback(async () => {
    if (ids.length === 0) {
      Alert.alert('无法生成', '未接收到选中的碎片');
      return;
    }
    if (!topic.trim()) {
      Alert.alert('无法生成', '先补充一个主题，AI 才能按 SOP 整理这组素材。');
      return;
    }

    try {
      const scriptId = await generator.run(ids, topic.trim());
      router.replace(`/script/${scriptId}`);
    } catch (err) {
      const message = getErrorMessage(err, '生成失败');
      Alert.alert('生成失败', message);
    }
  }, [generator, ids, router, topic]);

  return {
    ids,
    fragments,
    isLoading,
    error,
    topic,
    generator,
    canGenerate: ids.length > 0 && topic.trim().length > 0 && generator.status !== 'loading',
    selectedSummary: `已选碎片（${ids.length}）`,
    getFragmentDisplayText: displayFragmentText,
    setTopic,
    generate,
    goBack: () => router.back(),
  };
}
