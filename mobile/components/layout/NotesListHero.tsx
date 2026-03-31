import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';

/*统一列表页 hero 标题区，让首页和子列表页共享同一套排版壳层。 */
export function NotesListHero({
  title,
  subtitle,
  variant = 'default',
  titleLines,
  containerStyle,
}: {
  title: string;
  subtitle: string;
  variant?: 'default' | 'large';
  titleLines?: number;
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const theme = useAppTheme();
  const isLarge = variant === 'large';

  return (
    <View style={[isLarge ? styles.heroBlockLarge : styles.heroBlockDefault, containerStyle]}>
      <Text
        style={[
          isLarge ? styles.heroTitleLarge : styles.heroTitleDefault,
          { color: theme.colors.text },
        ]}
        numberOfLines={titleLines}
      >
        {title}
      </Text>
      <Text
        style={[
          isLarge ? styles.heroSubtitleLarge : styles.heroSubtitleDefault,
          { color: theme.colors.textSubtle },
        ]}
      >
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroBlockLarge: {
    marginTop: 12,
    marginBottom: 16,
  },
  heroBlockDefault: {
    marginTop: 10,
    marginBottom: 12,
  },
  heroTitleLarge: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  heroTitleDefault: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -0.9,
  },
  heroSubtitleLarge: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
  heroSubtitleDefault: {
    marginTop: 3,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '500',
  },
});
