import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, eyebrow, leading, trailing }: ScreenHeaderProps) {
  const theme = useAppTheme();

  return (
    <View style={[styles.container, { marginBottom: theme.layout.sectionGap }]}>
      <View style={styles.row}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <View style={styles.copy}>
          {eyebrow ? (
            <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>{eyebrow}</Text>
          ) : null}
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: theme.colors.textSubtle }]}>{subtitle}</Text>
          ) : null}
        </View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  copy: {
    flex: 1,
  },
  leading: {
    paddingTop: 4,
    marginRight: 12,
  },
  trailing: {
    paddingTop: 4,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
  },
});
