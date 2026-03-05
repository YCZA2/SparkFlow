import React from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { TeleprompterOverlay } from '@/components/TeleprompterOverlay';

const FALLBACK_TEXT =
  '今天我想聊一个很多人都在做、但很少人做对的主题：定位。' +
  '你会发现，很多账号不缺努力，也不缺更新频率，真正缺的是一句能让人记住你的话。' +
  '定位不是给自己贴标签，而是帮用户在三秒内理解你是谁、能提供什么价值。' +
  '如果你的内容什么都讲一点，用户就什么都记不住。' +
  '所以先问自己三个问题：你最擅长解决什么问题？你想吸引哪一类人？别人为什么要听你说？' +
  '把这三个问题想清楚，再回头做内容，你会发现选题、表达和转化都更顺。';

export default function ShootScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { script_id, content } = useLocalSearchParams<{
    script_id?: string;
    content?: string;
  }>();

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#F2F2F7' }]}>
      <Stack.Screen options={{ title: '拍摄' }} />

      <View style={styles.content}>
        <View style={styles.teleprompterContainer}>
          <TeleprompterOverlay text={content?.trim() ? content : FALLBACK_TEXT} />
        </View>

        <View style={[styles.metaCard, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
          <Text style={[styles.label, { color: '#8E8E93' }]}>script_id</Text>
          <Text style={[styles.value, { color: isDark ? '#E5E5EA' : '#111111' }]}>
            {script_id || '-'}
          </Text>
          <Text style={[styles.tip, { color: '#8E8E93' }]}>
            点击提词区可暂停/继续，暂停后上下拖动可调整进度；右上角 A-/A+ 可调字号。
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 16,
    gap: 12,
  },
  teleprompterContainer: {
    height: '62%',
  },
  metaCard: {
    borderRadius: 12,
    padding: 14,
  },
  label: {
    fontSize: 12,
    marginTop: 2,
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    lineHeight: 20,
  },
  tip: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },
});
