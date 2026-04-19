import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
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
      style={[
        styles.safeArea,
        {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          paddingHorizontal: theme.layout.bottomBarPadding,
        },
        style,
      ]}
      className={className}
    >
      <View className={`pb-sf-sm pt-sf-md ${contentClassName ?? ''}`} style={contentStyle}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
