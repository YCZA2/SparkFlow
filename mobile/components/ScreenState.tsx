import React from 'react';
import { ActivityIndicator, TouchableOpacity, View, Text } from 'react-native';
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
    <View className="flex-1 items-center justify-center px-8">
      {icon ? (
        <Text className="mb-sf-lg text-[52px] text-app-text-subtle dark:text-app-text-subtle-dark">
          {icon}
        </Text>
      ) : null}
      <Text className="mb-sf-sm text-center text-lg font-semibold text-app-text dark:text-app-text-dark">
        {title}
      </Text>
      {message ? (
        <Text className="text-center text-sm leading-5 text-app-text-subtle dark:text-app-text-subtle-dark">
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          className="mt-5 min-w-40 items-center rounded-[10px] px-5 py-sf-md"
          style={{ backgroundColor: actionColor }}
          onPress={onAction}
          activeOpacity={0.85}
        >
          <Text className="text-[15px] font-semibold text-white">{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
      {secondaryActionLabel && onSecondaryAction ? (
        <TouchableOpacity
          className="mt-sf-md min-w-40 items-center rounded-[10px] px-5 py-sf-md bg-app-surface-muted dark:bg-app-surface-muted-dark"
          onPress={onSecondaryAction}
          activeOpacity={0.85}
        >
          <Text className="text-[15px] font-semibold text-app-text dark:text-app-text-dark">
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
    <View className="flex-1 items-center justify-center px-8">
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text className="mt-sf-sm text-center text-sm leading-5 text-app-text-subtle dark:text-app-text-subtle-dark">
        {message}
      </Text>
    </View>
  );
}
