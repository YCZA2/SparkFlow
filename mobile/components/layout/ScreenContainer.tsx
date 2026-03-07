import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleProp,
  StyleSheet,
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
  contentContainerStyle,
  style,
}: ScreenContainerProps) {
  const theme = useAppTheme();
  const paddingHorizontal = padded ? theme.layout.screenPadding : 0;
  const paddingBottom = includeBottomInset ? theme.layout.bottomBarPadding + 88 : 0;

  const content = scrollable ? (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
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
      style={[
        styles.content,
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
      style={[styles.safeArea, { backgroundColor: theme.colors.background }, style]}
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
      style={styles.keyboard}
    >
      {body}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
  },
});
