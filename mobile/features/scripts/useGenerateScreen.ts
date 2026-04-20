import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { captureRequiredTaskExecutionScope, TaskScopeMismatchError } from '@/features/auth/taskScope';
import { flushBackupQueue } from '@/features/backups/queue';
import { useSelectedFragments } from '@/features/fragments/hooks';
import { generateScript } from '@/features/scripts/api';
import { rememberPendingScriptTask } from '@/features/scripts/pendingScriptTasks';
import { resolveScriptFromTerminalTask } from '@/features/scripts/scriptTask';
import { trackPendingScriptTask } from '@/features/tasks/scriptRecovery';
import { useTaskRunQuery, useTaskRunTerminalConsumer } from '@/features/tasks/taskQuery';
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
  generator: {
    status: 'idle' | 'loading' | 'success' | 'error';
    error: string | null;
  };
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
  const [generatorError, setGeneratorError] = useState<string | null>(null);
  const [pendingTask, setPendingTask] = useState<{
    taskRunId: string;
    scope: ReturnType<typeof captureRequiredTaskExecutionScope>;
  } | null>(null);

  const generateMutation = useMutation({
    mutationFn: async (input: { fragmentIds: string[]; topic: string }) => {
      const scope = captureRequiredTaskExecutionScope();
      await flushBackupQueue({ scope }).catch((flushError) => {
        throw new Error(getErrorMessage(flushError, '本地内容尚未同步，无法保证生成基于最新正文'));
      });
      const task = await generateScript({
        topic: input.topic,
        fragment_ids: input.fragmentIds,
      });
      await rememberPendingScriptTask(scope.userId, {
        taskRunId: task.task_id,
        kind: 'manual',
        createdAt: new Date().toISOString(),
      });
      void trackPendingScriptTask(task.task_id, scope).catch((error) => {
        if (!(error instanceof TaskScopeMismatchError)) {
          console.warn('脚本任务后台恢复托管失败:', error);
        }
      });
      return {
        taskRunId: task.task_id,
        scope,
      };
    },
    onMutate: async () => {
      setGeneratorError(null);
    },
    onSuccess: (result) => {
      setPendingTask(result);
    },
    onError: (mutationError) => {
      if (mutationError instanceof TaskScopeMismatchError) {
        return;
      }
      setGeneratorError(getErrorMessage(mutationError, '生成失败'));
    },
  });

  const taskQuery = useTaskRunQuery(pendingTask?.taskRunId, {
    enabled: Boolean(pendingTask),
    scope: pendingTask?.scope ?? null,
  });

  useTaskRunTerminalConsumer({
    pending: pendingTask,
    taskRunId: pendingTask?.taskRunId,
    taskQuery,
    onTerminal: async (currentPendingTask, taskRun, context) => {
      const script = await resolveScriptFromTerminalTask(taskRun, '生成失败', {
        scope: currentPendingTask.scope,
        taskRunId: currentPendingTask.taskRunId,
      });
      if (context.isCancelled()) {
        return;
      }
      router.replace(`/script/${script.id}`);
    },
    onError: async (_currentPendingTask, error, context) => {
      if (error instanceof TaskScopeMismatchError || context.isCancelled()) {
        return;
      }
      const message = getErrorMessage(error, '生成失败');
      setGeneratorError(message);
      Alert.alert('生成失败', message);
    },
    onSettled: async () => {
      setPendingTask(null);
    },
  });

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
      await generateMutation.mutateAsync({
        fragmentIds: ids,
        topic: topic.trim(),
      });
    } catch (err) {
      if (err instanceof TaskScopeMismatchError) {
        return;
      }
      const message = getErrorMessage(err, '生成失败');
      Alert.alert('生成失败', message);
    }
  }, [generateMutation, ids, topic]);

  const generator = useMemo(() => {
    const status =
      generateMutation.isPending || taskQuery.phase === 'loading' || taskQuery.phase === 'polling'
        ? 'loading'
        : generatorError
          ? 'error'
          : 'idle';

    return {
      status,
      error: generatorError,
    } as GenerateScreenState['generator'];
  }, [generateMutation.isPending, generatorError, taskQuery.phase]);

  return {
    ids,
    fragments,
    isLoading,
    error,
    topic,
    generator,
    canGenerate:
      ids.length > 0 &&
      topic.trim().length > 0 &&
      generator.status !== 'loading' &&
      !pendingTask,
    selectedSummary: `已选碎片（${ids.length}）`,
    getFragmentDisplayText: displayFragmentText,
    setTopic,
    generate,
    goBack: () => router.back(),
  };
}
