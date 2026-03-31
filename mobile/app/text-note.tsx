import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { type Href, Stack, useLocalSearchParams } from 'expo-router';

import { ScreenState } from '@/components/ScreenState';
import { getOrCreateDeviceId } from '@/features/auth/device';
import { FragmentDetailScreen } from '@/features/fragments/detail/FragmentDetailScreen';
import { createLocalFragmentEntity } from '@/features/fragments/store';
import { useAppTheme } from '@/theme/useAppTheme';
import { getErrorMessage } from '@/utils/error';

export default function TextNoteScreen() {
  const params = useLocalSearchParams<{ returnTo?: string; source?: string; folderId?: string }>();
  const theme = useAppTheme();
  const [fragmentId, setFragmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    /*进入写下灵感时直接创建本地真值 fragment，不再先走远端建单。 */
    let cancelled = false;

    const bootstrap = async () => {
      try {
        setError(null);
        const deviceId = await getOrCreateDeviceId();
        const fragment = await createLocalFragmentEntity({
          folderId: params.folderId,
          source: 'manual',
          contentState: 'empty',
          deviceId,
        });
        if (cancelled) return;
        setFragmentId(fragment.id);
      } catch (err) {
        if (cancelled) return;
        const message = getErrorMessage(err, '创建失败，请重试');
        setError(message);
        Alert.alert('进入编辑器失败', message);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [attempt, params.folderId]);

  const exitTo: Href | null =
    params.returnTo === '/record-audio'
      ? {
          pathname: '/record-audio',
          params: params.folderId ? { folderId: params.folderId } : {},
        }
      : params.returnTo === '/'
        ? '/'
        : null;

  if (fragmentId) {
    return (
      <FragmentDetailScreen
        fragmentId={fragmentId}
        exitTo={exitTo}
        cleanupOnReturn="empty_manual_placeholder"
      />
    );
  }

  if (error) {
    return (
      <View style={[styles.stateContainer, { backgroundColor: theme.colors.background }]}>
        <Stack.Screen options={{ title: '写下灵感', headerShown: false }} />
        <ScreenState
          icon="⚠️"
          title="进入编辑器失败"
          message={error}
          actionLabel="重试"
          onAction={() => {
            setError(null);
            setFragmentId(null);
            setAttempt((value) => value + 1);
          }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.stateContainer, { backgroundColor: theme.colors.background }]}>
      <Stack.Screen options={{ title: '写下灵感', headerShown: false }} />
      <ActivityIndicator size="large" color={theme.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
