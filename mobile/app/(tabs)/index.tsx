import React from 'react';
import { Alert, ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Themed';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useAudioUpload } from '@/hooks/useAudioUpload';
import { useAppTheme } from '@/theme/useAppTheme';

function getStatusText(status: 'idle' | 'recording' | 'recorded', durationLabel: string) {
  if (status === 'recording') {
    return `正在录音… ${durationLabel}`;
  }
  if (status === 'recorded') {
    return `录音完成 (${durationLabel})`;
  }
  return '点击开始录音';
}

export default function HomeScreen() {
  const theme = useAppTheme();
  const recorder = useAudioRecorder();
  const upload = useAudioUpload();

  const handleToggleRecording = async () => {
    if (recorder.status === 'recording') {
      const uri = await recorder.stopRecording();
      if (!uri) return;

      try {
        const result = await upload.upload(uri);
        if (result) {
          Alert.alert('上传成功', '音频已上传，正在后台转写中...');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : '上传失败，请重试';
        Alert.alert('上传失败', message);
      }
      return;
    }

    upload.reset();
    await recorder.startRecording();
  };

  const handleRetryUpload = async () => {
    if (!recorder.recordedUri) return;

    try {
      await upload.upload(recorder.recordedUri);
    } catch {
      // Error state is already captured by the upload hook.
    }
  };

  const isUploading = upload.status === 'loading';
  const statusText = getStatusText(recorder.status, recorder.durationLabel);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>灵感捕手</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSubtle }]}>
          随时记录你的灵感碎片
        </Text>
      </View>

      <View style={styles.middleArea}>
        {isUploading ? (
          <View style={[styles.statusCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>正在上传音频...</Text>
            <Text style={[styles.cardMessage, { color: theme.colors.textSubtle }]}>请稍候</Text>
          </View>
        ) : upload.status === 'success' && upload.result ? (
          <View style={[styles.statusCard, theme.shadow.card, styles.successCard, { backgroundColor: theme.colors.surface, borderLeftColor: theme.colors.success }]}>
            <Text style={[styles.statusIcon, { color: theme.colors.success }]}>✓</Text>
            <Text style={[styles.cardTitle, { color: theme.colors.success }]}>上传成功</Text>
            <Text style={[styles.cardMessage, { color: theme.colors.textSubtle }]}>
              {upload.result.message}
            </Text>
            <TouchableOpacity
              style={[styles.secondaryButton, { backgroundColor: theme.colors.surfaceMuted }]}
              onPress={recorder.playRecording}
              activeOpacity={0.85}
            >
              <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
                播放录音
              </Text>
            </TouchableOpacity>
          </View>
        ) : upload.status === 'error' && upload.error ? (
          <View style={[styles.statusCard, theme.shadow.card, styles.errorCard, { backgroundColor: theme.colors.surface, borderLeftColor: theme.colors.danger }]}>
            <Text style={[styles.statusIcon, { color: theme.colors.danger }]}>✗</Text>
            <Text style={[styles.cardTitle, { color: theme.colors.danger }]}>上传失败</Text>
            <Text style={[styles.cardMessage, { color: theme.colors.textSubtle }]}>
              {upload.error}
            </Text>
            <TouchableOpacity
              style={[styles.secondaryButton, { backgroundColor: theme.colors.danger }]}
              onPress={handleRetryUpload}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>重新上传</Text>
            </TouchableOpacity>
          </View>
        ) : recorder.recordedUri ? (
          <View style={[styles.statusCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>录音完成，准备上传...</Text>
            <Text style={[styles.recordedPath, { color: theme.colors.textSubtle }]} numberOfLines={2}>
              {recorder.recordedUri}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.recorderContainer}>
        <Text
          style={[
            styles.statusText,
            {
              color:
                recorder.status === 'recording'
                  ? theme.colors.danger
                  : theme.colors.textSubtle,
            },
          ]}
        >
          {statusText}
        </Text>

        <TouchableOpacity
          style={[
            styles.recordButton,
            {
              backgroundColor:
                recorder.status === 'recording'
                  ? theme.colors.danger
                  : theme.colors.primary,
            },
            isUploading && styles.recordButtonDisabled,
          ]}
          onPress={handleToggleRecording}
          activeOpacity={0.85}
          disabled={isUploading}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.recordButtonText}>
              {recorder.status === 'recording' ? '停止录音' : '开始录音'}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={[styles.hintText, { color: theme.colors.textSubtle }]}>
          {isUploading
            ? '正在上传音频，请稍候...'
            : recorder.status === 'recording'
            ? '再次点击结束录音'
            : recorder.recordedUri
            ? '录音已保存，可继续重录'
            : '点击按钮开始录音'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 8,
  },
  middleArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
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
  recorderContainer: {
    alignItems: 'center',
    paddingBottom: 80,
    paddingHorizontal: 20,
  },
  statusText: {
    fontSize: 16,
    marginBottom: 20,
    fontWeight: '500',
  },
  recordButton: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  recordButtonDisabled: {
    opacity: 0.7,
  },
  recordButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  hintText: {
    fontSize: 12,
    marginTop: 16,
  },
});
