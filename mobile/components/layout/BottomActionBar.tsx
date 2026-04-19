import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/useAppTheme';

interface BottomActionBarProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  className?: string;
  contentClassName?: string;
}

export function BottomActionBar({
  children,
  style,
  contentStyle,
  className,
  contentClassName,
}: BottomActionBarProps) {
  const theme = useAppTheme();

  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right']}
      className={`border-t px-sf-bottom-bar bg-app-surface dark:bg-app-surface-dark ${className ?? ''}`}
      style={[
        {
          borderTopColor: theme.colors.border,
        },
        style,
      ]}
    >
      <View className={`pb-sf-sm pt-sf-md ${contentClassName ?? ''}`} style={contentStyle}>
        {children}
      </View>
    </SafeAreaView>
  );
}
