import React, { useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View, Text } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as DocumentPicker from 'expo-document-picker';

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
 转录进度由碎片列表的媒体任务状态展示，无需在此页等待。
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
      className="flex-1 bg-app-background dark:bg-app-background-dark"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: '导入音频' }} />

      <ScrollView contentContainerClassName="p-5 pb-8">
        <View className="mb-sf-lg">
          <Text className="text-[28px] font-bold text-app-text dark:text-app-text-dark">把本地音频收进灵感库</Text>
          <Text className="mt-sf-sm text-sm leading-5 text-app-text-subtle dark:text-app-text-subtle-dark">
            选取手机里的音频文件，上传后会自动转写文案并生成摘要标签。
          </Text>
        </View>

        <View
          className="rounded-[24px] border bg-app-surface p-[18px] dark:bg-app-surface-dark"
          style={[
            theme.shadow.card,
            { borderColor: theme.colors.border },
          ]}
        >
          {/*文件选取区域：未选时显示提示文案，已选时显示文件名。*/}
          <Pressable
            onPress={handlePickFile}
            disabled={isUploading}
            className="items-center gap-[10px] rounded-[14px] border border-dashed bg-app-surface-muted px-sf-lg py-sf-section dark:bg-app-surface-muted-dark"
            style={[
              { borderColor: theme.colors.border },
            ]}
          >
            <SymbolView name="doc.badge.plus" size={28} tintColor={theme.colors.primary} />
            <Text
              className="text-center text-[15px] font-semibold"
              style={{ color: pickedFile ? theme.colors.text : theme.colors.textSubtle }}
              numberOfLines={2}
            >
              {pickedFile ? pickedFile.name : '点击选取音频文件'}
            </Text>
            {pickedFile && (
              <Text className="text-xs text-app-text-subtle dark:text-app-text-subtle-dark">
                {pickedFile.mimeType}
              </Text>
            )}
          </Pressable>

          <View className="mt-sf-lg border-t border-slate-400/30 pt-sf-lg">
            <Text className="text-sm font-bold text-app-text dark:text-app-text-dark">支持的格式</Text>
            <Text className="mt-[6px] text-[13px] leading-[19px] text-app-text-subtle dark:text-app-text-subtle-dark">
              支持 M4A、MP3、WAV、AAC、OGG 等常见音频格式。文件大小建议不超过 200MB。
            </Text>
          </View>

          <Pressable
            className="mt-sf-section items-center justify-center rounded-[14px] py-[15px]"
            style={[
              { backgroundColor: canSubmit ? theme.colors.primary : theme.colors.textSubtle },
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-[15px] font-bold text-white">开始导入并提取文案</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
