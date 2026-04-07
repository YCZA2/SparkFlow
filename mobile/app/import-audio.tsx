import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as DocumentPicker from 'expo-document-picker';

import { Text } from '@/components/Themed';
import { markFragmentsStale } from '@/features/fragments/refreshSignal';
import { useAudioUpload } from '@/features/recording/hooks';
import { useAppTheme } from '@/theme/useAppTheme';
import { getErrorMessage } from '@/utils/error';

interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

/**
 承接从手机文件系统选取音频文件并上传转写，上传完成后立即返回碎片列表。
 转录进度由碎片列表的 media_pipeline_status 展示，无需在此页等待。
 */
export default function ImportAudioScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ folderId?: string }>();
  const theme = useAppTheme();
  const audioUpload = useAudioUpload();

  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const canSubmit = !!pickedFile && !isUploading;

  /*打开系统文件选择器，过滤音频类型。copyToCacheDirectory 确保 URI 在 sandbox 内可读。*/
  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      const asset = result.assets[0];
      setPickedFile({
        uri: asset.uri,
        name: asset.name ?? '音频文件',
        mimeType: asset.mimeType ?? 'audio/*',
      });
    } catch (err) {
      Alert.alert('选取失败', getErrorMessage(err, '无法访问文件，请重试'));
    }
  };

  /*上传音频并启动后台转写，成功后立即返回列表页，转录进度在列表中展示。*/
  const handleSubmit = async () => {
    if (!pickedFile) return;

    try {
      setIsUploading(true);
      await audioUpload.upload(pickedFile.uri, params.folderId);
      markFragmentsStale();
      router.back();
    } catch (err) {
      setIsUploading(false);
      Alert.alert('上传失败', getErrorMessage(err, '音频上传失败，请重试'));
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: '导入音频' }} />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.colors.text }]}>把本地音频收进灵感库</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSubtle }]}>
            选取手机里的音频文件，上传后会自动转写文案并生成摘要标签。
          </Text>
        </View>

        <View
          style={[
            styles.card,
            theme.shadow.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          {/*文件选取区域：未选时显示提示文案，已选时显示文件名。*/}
          <Pressable
            onPress={handlePickFile}
            disabled={isUploading}
            style={[
              styles.filePicker,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceMuted },
            ]}
          >
            <SymbolView name="doc.badge.plus" size={28} tintColor={theme.colors.primary} />
            <Text
              style={[
                styles.filePickerText,
                { color: pickedFile ? theme.colors.text : theme.colors.textSubtle },
              ]}
              numberOfLines={2}
            >
              {pickedFile ? pickedFile.name : '点击选取音频文件'}
            </Text>
            {pickedFile && (
              <Text style={[styles.fileMimeText, { color: theme.colors.textSubtle }]}>
                {pickedFile.mimeType}
              </Text>
            )}
          </Pressable>

          <View style={styles.tipBlock}>
            <Text style={[styles.tipTitle, { color: theme.colors.text }]}>支持的格式</Text>
            <Text style={[styles.tipText, { color: theme.colors.textSubtle }]}>
              支持 M4A、MP3、WAV、AAC、OGG 等常见音频格式。文件大小建议不超过 200MB。
            </Text>
          </View>

          <Pressable
            style={[
              styles.submitButton,
              { backgroundColor: canSubmit ? theme.colors.primary : theme.colors.textSubtle },
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>开始导入并提取文案</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  filePicker: {
    borderWidth: 1,
    borderRadius: 14,
    borderStyle: 'dashed',
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 10,
  },
  filePickerText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  fileMimeText: {
    fontSize: 12,
  },
  tipBlock: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148, 163, 184, 0.35)',
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  tipText: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
  },
  submitButton: {
    marginTop: 24,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
