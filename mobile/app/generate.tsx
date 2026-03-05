import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { fetchFragmentDetail } from '@/services/fragments';
import { generateScript } from '@/services/scripts';
import type { Fragment } from '@/types/fragment';
import type { ScriptMode } from '@/types/script';

function displayFragmentText(fragment: Fragment): string {
  if (fragment.summary) return fragment.summary;
  if (fragment.transcript) return fragment.transcript.slice(0, 80);
  return '无内容';
}

export default function GenerateScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { fragmentIds } = useLocalSearchParams<{ fragmentIds?: string }>();

  const ids = useMemo(
    () => (fragmentIds ? fragmentIds.split(',').map((id) => id.trim()).filter(Boolean) : []),
    [fragmentIds]
  );

  const [fragments, setFragments] = useState<Fragment[]>([]);
  const [isLoadingFragments, setIsLoadingFragments] = useState(true);
  const [mode, setMode] = useState<ScriptMode>('mode_a');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (ids.length === 0) {
        setIsLoadingFragments(false);
        return;
      }

      try {
        const detailList = await Promise.all(ids.map((id) => fetchFragmentDetail(id)));
        setFragments(detailList);
      } catch (error) {
        const message = error instanceof Error ? error.message : '读取碎片失败';
        Alert.alert('加载失败', message);
      } finally {
        setIsLoadingFragments(false);
      }
    };

    load();
  }, [ids]);

  const handleGenerate = async () => {
    if (ids.length === 0) {
      Alert.alert('无法生成', '未接收到选中的碎片');
      return;
    }

    try {
      setIsGenerating(true);
      const script = await generateScript({
        fragment_ids: ids,
        mode,
      });
      router.replace(`/script/${script.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '生成失败';
      Alert.alert('生成失败', message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000000' : '#F2F2F7' }]}>
      <Stack.Screen options={{ title: 'AI 编导' }} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
          已选碎片（{ids.length}）
        </Text>

        {isLoadingFragments ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={[styles.helperText, { color: isDark ? '#8E8E93' : '#8E8E93' }]}>
              正在读取碎片...
            </Text>
          </View>
        ) : (
          fragments.map((fragment) => (
            <View
              key={fragment.id}
              style={[styles.fragmentCard, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}
            >
              <Text style={[styles.fragmentText, { color: isDark ? '#FFFFFF' : '#111111' }]}>
                {displayFragmentText(fragment)}
              </Text>
            </View>
          ))
        )}

        <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
          生成模式
        </Text>

        <TouchableOpacity
          style={[
            styles.modeCard,
            { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' },
            mode === 'mode_a' && styles.modeCardActive,
          ]}
          onPress={() => setMode('mode_a')}
          activeOpacity={0.8}
        >
          <Text style={[styles.modeTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
            导师爆款模式
          </Text>
          <Text style={[styles.modeDesc, { color: isDark ? '#8E8E93' : '#666666' }]}>
            黄金结构，节奏强，适合直接拍摄
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.modeCard,
            { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' },
            mode === 'mode_b' && styles.modeCardActive,
          ]}
          onPress={() => setMode('mode_b')}
          activeOpacity={0.8}
        >
          <Text style={[styles.modeTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
            我的专属二脑
          </Text>
          <Text style={[styles.modeDesc, { color: isDark ? '#8E8E93' : '#666666' }]}>
            更自然，贴近个人表达习惯
          </Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={[styles.bottomBar, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
        <TouchableOpacity
          style={[styles.generateButton, isGenerating && styles.generateButtonDisabled]}
          onPress={handleGenerate}
          disabled={isGenerating}
          activeOpacity={0.85}
        >
          {isGenerating ? (
            <View style={styles.generatingRow}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.generateButtonText}>AI 正在编写…</Text>
            </View>
          ) : (
            <Text style={styles.generateButtonText}>生成口播稿</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 120,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    marginTop: 6,
  },
  centerBlock: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  helperText: {
    marginTop: 8,
    fontSize: 13,
  },
  fragmentCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  fragmentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  modeCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeCardActive: {
    borderColor: '#007AFF',
  },
  modeTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  modeDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D1D1D6',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  generateButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  generateButtonDisabled: {
    opacity: 0.75,
  },
  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
