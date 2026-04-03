import React from 'react';
import { Pressable, TouchableOpacity } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';

import { recordAudioStyles as styles } from './recordAudioStyles';

/*渲染顶部圆形按钮，保持录音页与列表页头部的统一视觉语言。 */
export function HeaderCircleButton({
  symbol,
  onPress,
  tintColor,
}: {
  symbol: React.ComponentProps<typeof SymbolView>['name'];
  onPress: () => void;
  tintColor: string;
}) {
  const theme = useAppTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      style={[
        styles.headerButton,
        {
          backgroundColor:
            theme.name === 'dark' ? theme.colors.surfaceMuted : 'rgba(255,255,255,0.9)',
          borderColor: theme.colors.border,
        },
      ]}
    >
      <SymbolView name={symbol} size={20} tintColor={tintColor} />
    </TouchableOpacity>
  );
}

/*渲染录音主操作区的圆形按钮，统一暂停/播放/标记交互。 */
export function ActionButton({
  symbol,
  onPress,
  size = 56,
  color,
  backgroundColor,
}: {
  symbol: React.ComponentProps<typeof SymbolView>['name'];
  onPress: () => void;
  size?: number;
  color: string;
  backgroundColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <SymbolView name={symbol} size={size * 0.45} tintColor={color} />
    </Pressable>
  );
}

/*渲染底部辅助操作胶囊按钮，避免 route 层重复拼接主题样式。 */
export function SecondaryPill({
  label,
  symbol,
  onPress,
}: {
  label: string;
  symbol: React.ComponentProps<typeof SymbolView>['name'];
  onPress: () => void;
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryPill,
        theme.shadow.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          opacity: pressed ? 0.72 : 1,
        },
      ]}
    >
      <SymbolView name={symbol} size={20} tintColor={theme.colors.text} />
      <Text style={[styles.secondaryPillText, { color: theme.colors.text }]}>{label}</Text>
    </Pressable>
  );
}
