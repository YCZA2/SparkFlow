import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/useAppTheme';

interface BottomActionBarProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}

export function BottomActionBar({ children, style, contentStyle }: BottomActionBarProps) {
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
    >
      <View style={[styles.content, contentStyle]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 8,
  },
});
