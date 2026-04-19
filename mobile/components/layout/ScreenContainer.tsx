import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/useAppTheme';

interface ScreenContainerProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
  scrollable?: boolean;
  padded?: boolean;
  includeBottomInset?: boolean;
  keyboardAvoiding?: boolean;
  className?: string;
  contentClassName?: string;
  contentContainerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}

export function ScreenContainer({
  children,
  footer,
  scrollable = false,
  padded = false,
  includeBottomInset = false,
  keyboardAvoiding = false,
  className,
  contentClassName,
  contentContainerStyle,
  style,
}: ScreenContainerProps) {
  const theme = useAppTheme();
  const paddingHorizontal = padded ? theme.layout.screenPadding : 0;
  const paddingBottom = includeBottomInset ? theme.layout.bottomBarPadding + 88 : 0;

  const content = scrollable ? (
    <ScrollView
      className={contentClassName}
      contentContainerStyle={[
        { flexGrow: 1 },
        { paddingHorizontal, paddingBottom },
        contentContainerStyle,
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View
      className={`flex-1 ${contentClassName ?? ''}`}
      style={[
        { paddingHorizontal, paddingBottom },
        contentContainerStyle,
      ]}
    >
      {children}
    </View>
  );

  const body = (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[{ backgroundColor: theme.colors.background }, style]}
      className={`flex-1 ${className ?? ''}`}
    >
      {content}
      {footer}
    </SafeAreaView>
  );

  if (!keyboardAvoiding) {
    return body;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1"
    >
      {body}
    </KeyboardAvoidingView>
  );
}
