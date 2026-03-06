import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';

interface UploadResult {
  fragment_id: string;
  audio_path: string;
  message: string;
}

interface RecordingStatusCardProps {
  isUploading: boolean;
  uploadStatus: 'idle' | 'loading' | 'success' | 'error';
  uploadResult: UploadResult | null;
  uploadError: string | null;
  recordedUri: string | null;
  onPlayRecording: () => void;
  onRetryUpload: () => void;
}

export function RecordingStatusCard({
  isUploading,
  uploadStatus,
  uploadResult,
  uploadError,
  recordedUri,
  onPlayRecording,
  onRetryUpload,
}: RecordingStatusCardProps) {
  const theme = useAppTheme();

  if (isUploading) {
    return (
      <View style={[styles.statusCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>正在上传音频...</Text>
        <Text style={[styles.cardMessage, { color: theme.colors.textSubtle }]}>请稍候</Text>
      </View>
    );
  }

  if (uploadStatus === 'success' && uploadResult) {
    return (
      <View
        style={[
          styles.statusCard,
          theme.shadow.card,
          styles.successCard,
          { backgroundColor: theme.colors.surface, borderLeftColor: theme.colors.success },
        ]}
      >
        <Text style={[styles.statusIcon, { color: theme.colors.success }]}>✓</Text>
        <Text style={[styles.cardTitle, { color: theme.colors.success }]}>上传成功</Text>
        <Text style={[styles.cardMessage, { color: theme.colors.textSubtle }]}>{uploadResult.message}</Text>
        <TouchableOpacity
          style={[styles.secondaryButton, { backgroundColor: theme.colors.surfaceMuted }]}
          onPress={onPlayRecording}
          activeOpacity={0.85}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>播放录音</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (uploadStatus === 'error' && uploadError) {
    return (
      <View
        style={[
          styles.statusCard,
          theme.shadow.card,
          styles.errorCard,
          { backgroundColor: theme.colors.surface, borderLeftColor: theme.colors.danger },
        ]}
      >
        <Text style={[styles.statusIcon, { color: theme.colors.danger }]}>✗</Text>
        <Text style={[styles.cardTitle, { color: theme.colors.danger }]}>上传失败</Text>
        <Text style={[styles.cardMessage, { color: theme.colors.textSubtle }]}>{uploadError}</Text>
        <TouchableOpacity
          style={[styles.secondaryButton, { backgroundColor: theme.colors.danger }]}
          onPress={onRetryUpload}
          activeOpacity={0.85}
        >
          <Text style={styles.secondaryButtonText}>重新上传</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (recordedUri) {
    return (
      <View style={[styles.statusCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>录音完成，准备上传...</Text>
        <Text style={[styles.recordedPath, { color: theme.colors.textSubtle }]} numberOfLines={2}>
          {recordedUri}
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  statusCard: {
    width: '100%',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  successCard: {
    borderLeftWidth: 4,
  },
  errorCard: {
    borderLeftWidth: 4,
  },
  statusIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  cardMessage: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  recordedPath: {
    fontSize: 12,
    lineHeight: 18,
  },
  secondaryButton: {
    marginTop: 16,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
