import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { RecorderControls } from '@/features/recording/components/RecorderControls';
import { RecordingStatusCard } from '@/features/recording/components/RecordingStatusCard';
import { useAudioRecorder, useAudioUpload } from '@/features/recording/hooks';
import { useAppTheme } from '@/theme/useAppTheme';

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

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>灵感捕手</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textSubtle }]}>
          随时记录你的灵感碎片
        </Text>
      </View>

      <View style={styles.middleArea}>
        <RecordingStatusCard
          isUploading={isUploading}
          uploadStatus={upload.status}
          uploadResult={upload.result}
          uploadError={upload.error}
          recordedUri={recorder.recordedUri}
          onPlayRecording={recorder.playRecording}
          onRetryUpload={handleRetryUpload}
        />
      </View>

      <RecorderControls
        recorderStatus={recorder.status}
        durationLabel={recorder.durationLabel}
        isUploading={isUploading}
        hasRecording={Boolean(recorder.recordedUri)}
        onToggleRecording={handleToggleRecording}
      />
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
});
