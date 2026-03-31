import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

/*首页顶部圆形操作按钮保持统一尺寸和视觉密度。 */
export function HomeHeaderCircleButton({
  icon,
  onPress,
  tintColor,
  disabled,
}: {
  icon: SymbolName;
  onPress: () => void;
  tintColor: string;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} style={styles.headerButton} disabled={disabled}>
      <SymbolView name={icon} size={20} tintColor={tintColor} />
    </TouchableOpacity>
  );
}

/*首页菜单入口保留轻量圆形汉堡按钮，和右上操作形成一套节奏。 */
export function HomeMenuButton({
  onPress,
  color,
}: {
  onPress: () => void;
  color: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={8} style={styles.headerButton}>
      <View style={styles.hamburger}>
        <View style={[styles.hamburgerLine, { backgroundColor: color }]} />
        <View style={[styles.hamburgerLine, { backgroundColor: color }]} />
        <View style={[styles.hamburgerLine, { backgroundColor: color }]} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E5E5EA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  hamburger: {
    width: 18,
    height: 14,
    justifyContent: 'space-between',
  },
  hamburgerLine: {
    width: 18,
    height: 2.2,
    borderRadius: 1.1,
  },
});
