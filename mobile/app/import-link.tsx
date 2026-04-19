import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import { getOrCreateDeviceId } from '@/features/auth/device';
import { assertTaskScopeActive, captureRequiredTaskExecutionScope, TaskScopeMismatchError } from '@/features/auth/taskScope';
import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import { createLocalFragmentEntity, updateLocalFragmentEntity } from '@/features/fragments/store';
import { importExternalAudio } from '@/features/imports/api';
import { isImportLinkReady, resolveImportedFragmentId } from '@/features/imports/importState';
import { waitForTaskTerminal } from '@/features/tasks/api';
import { syncMediaIngestionTaskState } from '@/features/tasks/mediaIngestionTaskRecovery';
import { useAppTheme } from '@/theme/useAppTheme';
import { getErrorMessage } from '@/utils/error';

/**
 承接抖音分享链接导入，并在后台任务完成后进入碎片详情。
 */
export default function ImportLinkScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folderId?: string }>();
  const theme = useAppTheme();
  const [shareUrl, setShareUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedShareUrl = useMemo(() => shareUrl.trim(), [shareUrl]);
  const canSubmit = isImportLinkReady(trimmedShareUrl) && !isSubmitting;

  const handleSubmit = async () => {
    if (!trimmedShareUrl) {
      Alert.alert('还没有链接', '先粘贴一条抖音分享链接，再开始导入。');
      return;
    }

    try {
      setIsSubmitting(true);
      const scope = captureRequiredTaskExecutionScope();
      const deviceId = await getOrCreateDeviceId();
      const localFragment = await createLocalFragmentEntity({
        folderId: params.folderId,
        source: 'voice',
        audioSource: 'external_link',
        contentState: 'empty',
        deviceId,
      });
      const task = await importExternalAudio(trimmedShareUrl, params.folderId, localFragment.id);
      const taskId = task.task_id;
      assertTaskScopeActive(scope);
      await updateLocalFragmentEntity(localFragment.id, {
        media_pipeline_run_id: taskId,
        media_pipeline_status: 'queued',
        media_pipeline_error_message: null,
      });
      const taskRun = await waitForTaskTerminal(taskId, {
        timeoutMs: 180_000,
        scope,
      });
      const fragmentId = resolveImportedFragmentId(task.local_fragment_id ?? task.fragment_id, taskRun);

      await syncMediaIngestionTaskState(localFragment.id, taskRun, { scope });

      if (taskRun.status !== 'succeeded' || !fragmentId) {
        throw new Error(taskRun.error_message || '导入失败，请稍后重试');
      }

      markFragmentsStale();
      router.replace(`/fragment/${fragmentId}`);
    } catch (err) {
      if (err instanceof TaskScopeMismatchError) {
        setIsSubmitting(false);
        return;
      }
      setIsSubmitting(false);
      Alert.alert('导入失败', getErrorMessage(err, '导入失败，请重试'));
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-app-background dark:bg-app-background-dark"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: '导入链接' }} />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerClassName="p-5 pb-8">
        <View className="mb-sf-lg">
          <Text className="text-[28px] font-bold text-app-text dark:text-app-text-dark">把抖音内容收进灵感库</Text>
          <Text className="mt-sf-sm text-sm leading-5 text-app-text-subtle dark:text-app-text-subtle-dark">
            当前仅支持抖音分享链接。提交后会走后台任务解析音频、转写文案并生成摘要标签。
          </Text>
        </View>

        <View
          className="rounded-[24px] border bg-app-surface p-[18px] dark:bg-app-surface-dark"
          style={[
            theme.shadow.card,
            { borderColor: theme.colors.border },
          ]}
        >
          <Text className="mb-[10px] text-[15px] font-bold text-app-text dark:text-app-text-dark">抖音分享链接</Text>
          <TextInput
            value={shareUrl}
            onChangeText={setShareUrl}
            placeholder="粘贴抖音分享链接，例如 https://v.douyin.com/xxxx/"
            placeholderTextColor={theme.colors.textSubtle}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            editable={!isSubmitting}
            textAlignVertical="top"
            className="min-h-[140px] text-base leading-6 text-app-text dark:text-app-text-dark"
          />

          <View className="mt-sf-lg border-t border-slate-400/30 pt-sf-lg">
            <Text className="text-sm font-bold text-app-text dark:text-app-text-dark">如何复制链接</Text>
            <Text className="mt-[6px] text-[13px] leading-[19px] text-app-text-subtle dark:text-app-text-subtle-dark">
              打开抖音视频，点击分享，再选择“复制链接”。粘贴后直接提交即可。
            </Text>
          </View>

          <Pressable
            className="mt-sf-section items-center justify-center rounded-[14px] py-[15px]"
            style={[
              {
                backgroundColor: canSubmit ? theme.colors.primary : theme.colors.textSubtle,
              },
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-[15px] font-bold text-white">开始导入并提取文案</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
