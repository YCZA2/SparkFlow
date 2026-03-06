import { useColorScheme } from '@/components/useColorScheme';
import { themes } from './tokens';

export function useAppTheme() {
  const colorScheme = useColorScheme();
  return colorScheme === 'dark' ? themes.dark : themes.light;
}
