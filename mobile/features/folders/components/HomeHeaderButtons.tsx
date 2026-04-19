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
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-full border border-app-border bg-white/90"
      style={[buttonShadow, { borderWidth: StyleSheet.hairlineWidth }]}
      disabled={disabled}
    >
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
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      className="h-11 w-11 items-center justify-center rounded-full border border-app-border bg-white/90"
      style={[buttonShadow, { borderWidth: StyleSheet.hairlineWidth }]}
    >
      <View className="h-[14px] w-[18px] justify-between">
        <View className="h-[2.2px] w-[18px] rounded-[1.1px]" style={{ backgroundColor: color }} />
        <View className="h-[2.2px] w-[18px] rounded-[1.1px]" style={{ backgroundColor: color }} />
        <View className="h-[2.2px] w-[18px] rounded-[1.1px]" style={{ backgroundColor: color }} />
      </View>
    </TouchableOpacity>
  );
}

const buttonShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};
