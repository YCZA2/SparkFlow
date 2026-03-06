import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';

interface ScreenStateProps {
  icon?: string;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  tone?: 'default' | 'danger';
}

export function ScreenState({
  icon,
  title,
  message,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  tone = 'default',
}: ScreenStateProps) {
  const theme = useAppTheme();
  const actionColor = tone === 'danger' ? theme.colors.danger : theme.colors.primary;

  return (
    <View style={styles.container}>
      {icon ? <Text style={[styles.icon, { color: theme.colors.textSubtle }]}>{icon}</Text> : null}
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, { color: theme.colors.textSubtle }]}>{message}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: actionColor }]}
          onPress={onAction}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <TouchableOpacity
          style={[
            styles.button,
            styles.secondaryButton,
            { backgroundColor: theme.colors.surfaceMuted },
          ]}
          onPress={onSecondaryAction}
          activeOpacity={0.85}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>
            {secondaryActionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function LoadingState({ message = '加载中...' }: { message?: string }) {
  const theme = useAppTheme();

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text style={[styles.message, styles.loadingMessage, { color: theme.colors.textSubtle }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  icon: {
    fontSize: 52,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  loadingMessage: {
    marginTop: 8,
  },
  button: {
    minWidth: 160,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  secondaryButton: {
    marginTop: 12,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
