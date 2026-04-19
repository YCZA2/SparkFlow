import React from 'react';
import { View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Text } from '@/components/Themed';

/*统一列表页 hero 标题区，让首页和子列表页共享同一套排版壳层。 */
export function NotesListHero({
  title,
  subtitle,
  variant = 'default',
  titleLines,
  className,
  containerStyle,
}: {
  title: string;
  subtitle: string;
  variant?: 'default' | 'large';
  titleLines?: number;
  className?: string;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const isLarge = variant === 'large';
  const containerClassName = isLarge ? 'mb-sf-lg mt-sf-md' : 'mb-sf-md mt-[10px]';
  const titleClassName = isLarge
    ? 'text-[40px] font-extrabold leading-[44px] tracking-[-1.2px]'
    : 'text-[32px] font-extrabold leading-9 tracking-[-0.9px]';
  const subtitleClassName = isLarge ? 'mt-sf-xs' : 'mt-[3px]';

  return (
    <View className={`${containerClassName} ${className ?? ''}`} style={containerStyle}>
      <Text
        className={`${titleClassName} text-app-text dark:text-app-text-dark`}
        numberOfLines={titleLines}
      >
        {title}
      </Text>
      <Text
        className={`${subtitleClassName} text-[15px] font-medium leading-5 text-app-text-subtle dark:text-app-text-subtle-dark`}
      >
        {subtitle}
      </Text>
    </View>
  );
}
