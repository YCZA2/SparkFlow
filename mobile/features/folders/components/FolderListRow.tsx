import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

import { Text } from '@/components/Themed';
import { useAppTheme } from '@/theme/useAppTheme';
import type { FragmentFolder } from '@/types/folder';

type SymbolName = React.ComponentProps<typeof SymbolView>['name'];

/*渲染首页文件夹行，保持 Notes 风格的分组列表质感。 */
export function FolderListRow({
  folder,
  onPress,
  icon,
  countLabel,
  countValue,
  isFirstInSection,
  isLastInSection,
}: {
  folder: FragmentFolder;
  onPress: (folder: FragmentFolder) => void;
  icon: SymbolName;
  countLabel?: string;
  countValue: string;
  isFirstInSection?: boolean;
  isLastInSection?: boolean;
}) {
  const theme = useAppTheme();

  return (
    <TouchableOpacity
      className="mx-sf-screen flex-row items-center px-sf-screen py-[14px] bg-app-surface dark:bg-app-surface-dark"
      style={[
        {
          borderColor: theme.colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderTopLeftRadius: isFirstInSection ? 18 : 0,
          borderTopRightRadius: isFirstInSection ? 18 : 0,
          borderBottomLeftRadius: isLastInSection ? 18 : 0,
          borderBottomRightRadius: isLastInSection ? 18 : 0,
          marginTop: isFirstInSection ? 0 : StyleSheet.hairlineWidth,
        },
      ]}
      onPress={() => onPress(folder)}
      activeOpacity={0.84}
    >
      <View className="w-7 items-start">
        <SymbolView name={icon} size={21} tintColor="#D4A21D" />
      </View>
      <View className="ml-[6px] flex-1">
        <Text
          className="text-[17px] font-medium leading-[22px] text-app-text dark:text-app-text-dark"
          numberOfLines={1}
        >
          {folder.name}
        </Text>
        <Text className="mt-[2px] text-[13px] leading-[18px] text-app-text-subtle dark:text-app-text-subtle-dark">
          {countLabel ?? `${folder.fragment_count} 条内容`}
        </Text>
      </View>
      <View className="flex-row items-center gap-[6px]">
        <Text className="text-[17px] font-normal leading-[22px] text-app-text-subtle dark:text-app-text-subtle-dark">
          {countValue}
        </Text>
        <SymbolView name="chevron.right" size={15} tintColor={theme.colors.textSubtle} />
      </View>
    </TouchableOpacity>
  );
}
