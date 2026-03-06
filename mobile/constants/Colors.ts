import { themes } from '@/theme/tokens';

export default {
  light: {
    text: themes.light.colors.text,
    background: themes.light.colors.background,
    tint: themes.light.colors.primary,
    tabIconDefault: themes.light.colors.textSubtle,
    tabIconSelected: themes.light.colors.primary,
  },
  dark: {
    text: themes.dark.colors.text,
    background: themes.dark.colors.background,
    tint: themes.dark.colors.primary,
    tabIconDefault: themes.dark.colors.textSubtle,
    tabIconSelected: themes.dark.colors.primary,
  },
};
