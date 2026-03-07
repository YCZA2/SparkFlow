import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';

import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';

interface RecorderControlsProps {
  recorderStatus: 'idle' | 'recording' | 'recorded';
  durationLabel: string;
  isUploading: boolean;
  hasRecording: boolean;
  onToggleRecording: () => Promise<void>;
}

function getStatusText(status: 'idle' | 'recording' | 'recorded', durationLabel: string) {
  if (status === 'recording') {
    return `正在录音… ${durationLabel}`;
  }
  if (status === 'recorded') {
    return `录音完成 (${durationLabel})`;
  }
  return '点击开始录音';
}

export function RecorderControls({
  recorderStatus,
  durationLabel,
  isUploading,
  hasRecording,
  onToggleRecording,
}: RecorderControlsProps) {
  const theme = useAppTheme();

  return (
    <View style={styles.recorderContainer}>
      <Text
        style={[
          styles.statusText,
          {
            color: recorderStatus === 'recording' ? theme.colors.danger : theme.colors.textSubtle,
          },
        ]}
      >
        {getStatusText(recorderStatus, durationLabel)}
      </Text>

      <TouchableOpacity
        style={[
          styles.recordButton,
          {
            backgroundColor: recorderStatus === 'recording' ? theme.colors.danger : theme.colors.primary,
          },
          isUploading && styles.recordButtonDisabled,
        ]}
        onPress={onToggleRecording}
        activeOpacity={0.85}
        disabled={isUploading}
      >
        {isUploading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.recordButtonText}>
            {recorderStatus === 'recording' ? '停止录音' : '开始录音'}
          </Text>
        )}
      </TouchableOpacity>

      <Text style={[styles.hintText, { color: theme.colors.textSubtle }]}>
        {isUploading
          ? '正在上传音频，请稍候...'
          : recorderStatus === 'recording'
            ? '再次点击结束录音'
            : hasRecording
              ? '录音已保存，可继续重录'
              : '点击按钮开始录音'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  recorderContainer: {
    alignItems: 'center',
    paddingBottom: 4,
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
