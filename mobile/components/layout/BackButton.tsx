import React from 'react';
import { StyleSheet, TouchableOpacity, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';

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
      className={
        variant === 'circle'
          ? 'h-11 w-11 items-center justify-center rounded-full border'
          : 'min-h-11 min-w-11 flex-row items-center py-sf-xs pr-sf-sm'
      }
      style={[
        variant === 'circle'
          ? {
              backgroundColor:
                theme.name === 'dark' ? theme.colors.surfaceMuted : 'rgba(255,255,255,0.88)',
              borderColor: theme.colors.border,
              borderWidth: StyleSheet.hairlineWidth,
            }
          : null,
      ]}
    >
      <SymbolView name="chevron.left" size={22} tintColor={tintColor} />
      {showText && variant === 'plain' ? (
        <Text className="ml-[2px] text-[17px] font-normal" style={{ color: tintColor }}>
          {text}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}
