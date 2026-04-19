import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';

import type { FragmentDetailSheetProps } from './types';

/*统一映射碎片来源文案，避免 section 组件各自判断。 */
export function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    voice: '语音记录',
    manual: '文字记录',
    video_parse: '视频解析',
  };
  return labels[source] || source;
}

/*统一映射音频来源文案，减少元信息区块的条件分支噪音。 */
export function getAudioSourceLabel(audioSource: FragmentDetailSheetProps['metadata']['audioSource']): string | null {
  if (audioSource === 'external_link') return '外链导入';
  if (audioSource === 'upload') return '本地上传';
  return null;
}

/*渲染抽屉内的动作行，统一按钮密度和视觉层级。 */
export function ToolRow({
  icon,
  title,
  subtitle,
  onPress,
  disabled = false,
}: {
  icon: React.ComponentProps<typeof SymbolView>['name'];
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useAppTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      disabled={disabled}
      className="mb-[10px] flex-row items-center rounded-[18px] border bg-app-surface p-[14px] dark:bg-app-surface-dark"
      style={[
        theme.shadow.card,
        {
          borderColor: theme.colors.border,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
    >
      <View className="mr-sf-md h-[38px] w-[38px] items-center justify-center rounded-sf-md bg-app-surface-muted dark:bg-app-surface-muted-dark">
        <SymbolView name={icon} size={18} tintColor={theme.colors.primary} />
      </View>
      <View className="mr-[10px] flex-1">
        <Text className="text-[15px] font-bold leading-5 text-app-text dark:text-app-text-dark">{title}</Text>
        <Text className="mt-sf-xs text-xs leading-[17px] text-app-text-subtle dark:text-app-text-subtle-dark">{subtitle}</Text>
      </View>
      <SymbolView name="chevron.right" size={16} tintColor={theme.colors.textSubtle} />
    </TouchableOpacity>
  );
}

/*统一区块标题与内容间距，让 section 组合保持稳定节奏。 */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-sf-md">
      <Text className="text-[13px] font-bold uppercase leading-4 tracking-[0.4px]">{title}</Text>
      {children}
    </View>
  );
}

/*统一只读卡片容器，避免多个区块重复拼主题样式。 */
export function InfoCard({ children }: { children: React.ReactNode }) {
  const theme = useAppTheme();

  return (
    <View className="rounded-[18px] bg-app-surface p-[14px] dark:bg-app-surface-dark" style={theme.shadow.card}>
      {children}
    </View>
  );
}

/*展示单行碎片元信息，保持标签和值的阅读对齐。 */
export function InfoRow({ label, value }: { label: string; value: string }) {
  const theme = useAppTheme();

  return (
    <View className="py-sf-sm">
      <Text className="text-xs font-semibold leading-4 text-app-text-subtle dark:text-app-text-subtle-dark">{label}</Text>
      <Text className="mt-sf-xs text-[15px] font-medium leading-[22px] text-app-text dark:text-app-text-dark">{value}</Text>
    </View>
  );
}
