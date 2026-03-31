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
      style={[
        styles.folderCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
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
      <View style={styles.folderLeading}>
        <SymbolView name={icon} size={21} tintColor="#D4A21D" />
      </View>
      <View style={styles.folderInfo}>
        <Text style={[styles.folderName, { color: theme.colors.text }]} numberOfLines={1}>
          {folder.name}
        </Text>
        <Text style={[styles.folderCount, { color: theme.colors.textSubtle }]}>
          {countLabel ?? `${folder.fragment_count} 条内容`}
        </Text>
      </View>
      <View style={styles.folderMeta}>
        <Text style={[styles.folderCountValue, { color: theme.colors.textSubtle }]}>
          {countValue}
        </Text>
        <SymbolView name="chevron.right" size={15} tintColor={theme.colors.textSubtle} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  folderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  folderLeading: {
    width: 28,
    alignItems: 'flex-start',
  },
  folderInfo: {
    flex: 1,
    marginLeft: 6,
  },
  folderName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500',
  },
  folderCount: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  folderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  folderCountValue: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '400',
  },
});
