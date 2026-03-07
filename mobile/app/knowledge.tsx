import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';

export default function KnowledgePlaceholderScreen() {
  const theme = useAppTheme();

  return (
    <ScreenContainer padded scrollable contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: '知识库', headerShown: true }} />

      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>知识库入口预留中</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSubtle }]}>
          这里后续会支持上传方法论、粘贴高赞文案，以及沉淀你的表达习惯。
        </Text>
      </View>

      <View
        style={[
          styles.card,
          theme.shadow.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>后续会接入</Text>
        <Text style={[styles.cardText, { color: theme.colors.textSubtle }]}>
          支持 TXT / Word 上传、手动粘贴文本、文档类型选择，以及知识库列表管理。
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
    paddingBottom: 32,
    gap: 20,
  },
  header: {
    gap: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 10,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardText: {
    fontSize: 14,
    lineHeight: 22,
  },
});
