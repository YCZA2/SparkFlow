import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { LoadingState, ScreenState } from '@/components/ScreenState';
import { FragmentDetailSheet } from '@/features/fragments/components/FragmentDetailSheet';
import { FragmentRichEditor } from '@/features/fragments/components/FragmentRichEditor';
import { deleteFragment, fetchFragmentDetail } from '@/features/fragments/api';
import { useFragmentAudioPlayer } from '@/features/fragments/hooks/useFragmentAudioPlayer';
import { useFragmentRichEditor } from '@/features/fragments/hooks/useFragmentRichEditor';
import { getActiveSegmentIndex } from '@/features/fragments/presenters/speakerSegments';
import { useAppTheme } from '@/theme/useAppTheme';
import type { Fragment } from '@/types/fragment';

export default function FragmentDetailScreen() {
  /** 中文注释：把碎片详情页收敛为编辑器主视图，其余内容统一进入底部抽屉。 */
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useAppTheme();
  const [fragment, setFragment] = useState<Fragment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!id) {
        setError('无效的碎片ID');
        setIsLoading(false);
        return;
      }

      try {
        setError(null);
        setIsLoading(true);
        const data = await fetchFragmentDetail(id);
        setFragment(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [id]);

  const player = useFragmentAudioPlayer(fragment?.audio_file_url);
  const activeSegmentIndex = useMemo(() => {
    const segments = fragment?.speaker_segments;
    if (!segments?.length) {
      return null;
    }
    return getActiveSegmentIndex(segments, player.positionMs);
  }, [fragment?.speaker_segments, player.positionMs]);
  const bodyEditor = useFragmentRichEditor({
    fragment,
    onFragmentChange: setFragment,
  });

  const confirmDelete = async () => {
    if (!id) return;

    try {
      setIsDeleting(true);
      await deleteFragment(id);
      setIsSheetOpen(false);
      router.replace({
        pathname: '/',
        params: { refresh: 'true' },
      });
    } catch (err) {
      setIsDeleting(false);
      Alert.alert('删除失败', err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleDelete = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      if (window.confirm('删除后将无法恢复，是否继续？')) {
        void confirmDelete();
      }
      return;
    }

    Alert.alert('确认删除', '删除后将无法恢复，是否继续？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void confirmDelete();
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.stateContainer, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '' }} />
        <LoadingState message="加载中..." />
      </View>
    );
  }

  if (error || !fragment) {
    return (
      <View style={[styles.stateContainer, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '' }} />
        <ScreenState
          icon="⚠️"
          title="加载失败"
          message={error || '碎片不存在或已被删除'}
          actionLabel="点击重试"
          onAction={() => router.replace(`/fragment/${id}`)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen
        options={{
          title: '',
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: theme.colors.background,
          },
          headerTintColor: theme.colors.text,
          headerRight: () => (
            <TouchableOpacity
              style={styles.moreButton}
              onPress={() => setIsSheetOpen(true)}
              hitSlop={8}
            >
              <SymbolView name="ellipsis.circle" size={22} tintColor={theme.colors.text} />
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.editorStage}>
        <FragmentRichEditor
          editorRef={bodyEditor.editorRef}
          document={bodyEditor.document}
          statusLabel={bodyEditor.statusLabel}
          onEditorReady={bodyEditor.onEditorReady}
          onDocumentChange={bodyEditor.onDocumentChange}
          onSelectionChange={bodyEditor.onSelectionChange}
        />
      </View>

      <FragmentDetailSheet
        visible={isSheetOpen}
        fragment={fragment}
        isDeleting={isDeleting}
        isUploadingImage={bodyEditor.isUploadingImage}
        isAiRunning={bodyEditor.isAiRunning}
        activeSegmentIndex={activeSegmentIndex}
        player={player}
        onClose={() => setIsSheetOpen(false)}
        onDelete={handleDelete}
        onInsertImage={bodyEditor.onInsertImage}
        onAiAction={bodyEditor.onAiAction}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  stateContainer: {
    flex: 1,
  },
  moreButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorStage: {
    flex: 1,
  },
});
