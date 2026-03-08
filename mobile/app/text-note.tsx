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
import { createFragment } from '@/features/fragments/api';
import { useAppTheme } from '@/theme/useAppTheme';

const MIN_LENGTH = 1;

export default function TextNoteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ returnTo?: string; source?: string; folderId?: string }>();
  const theme = useAppTheme();
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedContent = useMemo(() => content.trim(), [content]);
  const canSubmit = trimmedContent.length >= MIN_LENGTH && !isSubmitting;

  const handleSubmit = async () => {
    if (!trimmedContent) {
      Alert.alert('还没写内容', '先记下一点想法，再保存成碎片吧。');
      return;
    }

    try {
      setIsSubmitting(true);
      const fragment = await createFragment(
        {
          transcript: trimmedContent,
          source: 'manual',
        },
        params.folderId
      );

      if (params.returnTo) {
        // 从录音界面跳转过来的，返回时直接回到主页
        router.replace('/');
        return;
      }

      router.replace(`/fragment/${fragment.id}`);
    } catch (err) {
      Alert.alert('保存失败', err instanceof Error ? err.message : '保存失败，请重试');
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: '写下灵感' }} />

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>先写一句，也算记住</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSubtle }]}>这是一条和语音记录并列的灵感输入方式。保存后会直接进入碎片库，用于 AI 编导与灵感云图。</Text>
        </View>

        <View
          style={[
            styles.editorCard,
            theme.shadow.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder="例如：今天想到一个选题，为什么很多人做内容越做越杂？核心可能不是执行力，而是没有一句清晰定位。"
            placeholderTextColor={theme.colors.textSubtle}
            multiline
            autoFocus
            textAlignVertical="top"
            returnKeyType="default"
            editable={!isSubmitting}
            style={[styles.input, { color: theme.colors.text }]}
          />

          <View style={styles.footer}>
            <Text style={[styles.counterText, { color: theme.colors.textSubtle }]}>
              {trimmedContent.length} 字
            </Text>
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
                <Text style={styles.submitButtonText}>保存这条灵感</Text>
              )}
            </Pressable>
          </View>
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
  editorCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    minHeight: 360,
  },
  input: {
    flex: 1,
    minHeight: 280,
    fontSize: 16,
    lineHeight: 24,
  },
  footer: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counterText: {
    fontSize: 13,
  },
  submitButton: {
    minWidth: 132,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
