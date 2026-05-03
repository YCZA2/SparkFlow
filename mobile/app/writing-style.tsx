import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, TextInput, TouchableOpacity, View, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { fetchWritingStyle, updateWritingStyle } from '@/features/auth/api';
import { useAppTheme } from '@/theme/useAppTheme';
import { getErrorMessage } from '@/utils/error';

export default function WritingStyleScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const style = await fetchWritingStyle();
        setContent(style.content);
      } catch (error) {
        Alert.alert('读取失败', getErrorMessage(error, '无法读取写作风格'));
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = useCallback(async () => {
    try {
      setIsSaving(true);
      await updateWritingStyle({ content: content.trim() });
      Alert.alert('保存成功', '写作风格已更新', [
        { text: '确定', onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert('保存失败', getErrorMessage(error, '无法保存写作风格'));
    } finally {
      setIsSaving(false);
    }
  }, [content, router]);

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: '写作风格' }} />
        <View className="flex-1 items-center justify-center bg-app-background dark:bg-app-background-dark">
          <ActivityIndicator color={theme.colors.primary} size="large" />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: '写作风格' }} />
      <ScrollView
        className="flex-1 bg-app-background dark:bg-app-background-dark"
        contentContainerClassName="p-sf-lg pb-10"
        keyboardShouldPersistTaps="handled"
      >
        <View
          className="mb-sf-lg rounded-sf-md bg-app-surface p-sf-lg dark:bg-app-surface-dark"
          style={theme.shadow.card}
        >
          <Text className="mb-sf-md text-[17px] font-semibold text-app-text dark:text-app-text-dark">
            你的创作风格
          </Text>
          <Text className="mb-sf-md text-[13px] leading-5 text-app-text-subtle dark:text-app-text-subtle-dark">
            描述你的表达习惯，AI 生成口播稿时会优先遵循。{'\n'}
            例如：口语化、喜欢用反问句、段落简短有力、先给结论再解释……
          </Text>
          <TextInput
            className="min-h-[160px] rounded-sf-sm border bg-app-surface-muted p-sf-md text-[15px] leading-6 text-app-text dark:bg-app-surface-muted-dark dark:text-app-text-dark"
            style={{ borderColor: theme.colors.border, textAlignVertical: 'top' }}
            value={content}
            onChangeText={setContent}
            placeholder="在此描述你的写作风格……"
            placeholderTextColor={theme.colors.textSubtle}
            multiline
            maxLength={2000}
          />
          <Text className="mt-sf-xs self-end text-[12px] text-app-text-subtle dark:text-app-text-subtle-dark">
            {content.length}/2000
          </Text>
        </View>

        <TouchableOpacity
          className="h-12 items-center justify-center rounded-sf-sm"
          style={{ backgroundColor: theme.colors.primary }}
          onPress={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text className="text-[16px] font-semibold text-white">保存</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}
