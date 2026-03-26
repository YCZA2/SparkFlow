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
  /** 视觉变体，circle 更贴近 iOS 备忘录页头按钮 */
  variant?: 'plain' | 'circle';
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
  variant = 'plain',
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
      activeOpacity={0.6}
      style={[
        styles.container,
        variant === 'circle' ? styles.circleContainer : null,
        variant === 'circle'
          ? {
              backgroundColor:
                theme.name === 'dark' ? theme.colors.surfaceMuted : 'rgba(255,255,255,0.88)',
              borderColor: theme.colors.border,
            }
          : null,
      ]}
    >
      <SymbolView name="chevron.left" size={22} tintColor={tintColor} />
      {showText && variant === 'plain' ? (
        <Text style={[styles.text, { color: tintColor }]}>{text}</Text>
      ) : null}
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
  circleContainer: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    justifyContent: 'center',
    paddingVertical: 0,
    paddingRight: 0,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize: 17,
    fontWeight: '400',
    marginLeft: 2,
  },
});
