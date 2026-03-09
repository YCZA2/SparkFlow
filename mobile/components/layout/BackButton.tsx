import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';

import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';

interface BackButtonProps {
  /** 自定义返回操作，默认调用 router.back() */
  onPress?: () => void;
  /** 按钮颜色，默认使用主题文字色 */
  color?: string;
  /** 是否显示文字，默认显示 */
  showText?: boolean;
  /** 文字内容，默认"返回" */
  text?: string;
}

/**
 * 统一返回按钮组件
 *
 * 设计规范：
 * - 使用 iOS 风格的 chevron.left 图标
 * - 图标右侧显示"返回"文字
 * - 可点击区域至少 44x44，符合 iOS 人机交互规范
 */
export function BackButton({
  onPress,
  color,
  showText = true,
  text = '返回',
}: BackButtonProps) {
  const router = useRouter();
  const theme = useAppTheme();

  const tintColor = color ?? theme.colors.text;

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={styles.container}
    >
      <SymbolView name="chevron.left" size={22} tintColor={tintColor} />
      {showText && (
        <Text style={[styles.text, { color: tintColor }]}>{text}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingRight: 8,
    minWidth: 44,
    minHeight: 44,
  },
  text: {
    fontSize: 17,
    fontWeight: '400',
    marginLeft: 2,
  },
});
