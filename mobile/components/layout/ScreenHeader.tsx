import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

import { Text } from '@/components/Themed';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  leading,
  trailing,
  className,
  style,
}: ScreenHeaderProps) {
  /*共享页头先接入 NativeWind，同时保留 style 兼容旧调用方。 */
  return (
    <View className={`mb-sf-section pt-sf-md ${className ?? ''}`} style={style}>
      <View className="flex-row items-start justify-between gap-sf-md">
        {leading ? <View className="mr-sf-md pt-sf-xs">{leading}</View> : null}
        <View className="flex-1">
          {eyebrow ? (
            <Text className="mb-sf-sm text-xs font-bold uppercase tracking-[0.8px] text-app-primary dark:text-app-primary-dark">
              {eyebrow}
            </Text>
          ) : null}
          <Text className="text-[28px] font-bold leading-[34px] text-app-text dark:text-app-text-dark">
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-sf-sm text-sm leading-5 text-app-text-subtle dark:text-app-text-subtle-dark">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {trailing ? <View className="pt-sf-xs">{trailing}</View> : null}
      </View>
    </View>
  );
}
