import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import { importExternalAudio } from '@/features/imports/api';
import { isImportLinkReady, resolveImportedFragmentId } from '@/features/imports/importState';
import { waitForPipelineTerminal } from '@/features/pipelines/api';
import { useAppTheme } from '@/theme/useAppTheme';

/**
 * 中文注释：承接抖音分享链接导入，并在后台任务完成后进入碎片详情。
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
      const task = await importExternalAudio(trimmedShareUrl, params.folderId);
      const pipeline = await waitForPipelineTerminal(task.pipeline_run_id, {
        timeoutMs: 180_000,
      });
      const fragmentId = resolveImportedFragmentId(task.fragment_id, pipeline);

      if (pipeline.status !== 'succeeded' || !fragmentId) {
        throw new Error(pipeline.error_message || '导入失败，请稍后重试');
      }

      markFragmentsStale();
      router.replace(`/fragment/${fragmentId}`);
    } catch (err) {
      setIsSubmitting(false);
      Alert.alert('导入失败', err instanceof Error ? err.message : '导入失败，请重试');
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: '导入链接' }} />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>把抖音内容收进灵感库</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSubtle }]}>
            当前仅支持抖音分享链接。提交后会走后台任务解析音频、转写文案并生成摘要标签。
          </Text>
        </View>

        <View
          style={[
            styles.card,
            theme.shadow.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.label, { color: theme.colors.text }]}>抖音分享链接</Text>
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
            style={[styles.input, { color: theme.colors.text }]}
          />

          <View style={styles.tipBlock}>
            <Text style={[styles.tipTitle, { color: theme.colors.text }]}>如何复制链接</Text>
            <Text style={[styles.tipText, { color: theme.colors.textSubtle }]}>
              打开抖音视频，点击分享，再选择“复制链接”。粘贴后直接提交即可。
            </Text>
          </View>

          <Pressable
            style={[
              styles.submitButton,
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
              <Text style={styles.submitButtonText}>开始导入并提取文案</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  input: {
    minHeight: 140,
    fontSize: 16,
    lineHeight: 24,
  },
  tipBlock: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148, 163, 184, 0.35)',
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  tipText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
  },
  submitButton: {
    marginTop: 24,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
