/**
 * DrawerContent - 抽屉菜单内容
 * 从 profile.tsx 提取的用户信息和菜单项
 */
import React from 'react';
import { ScrollView, TouchableOpacity, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { isDeveloperToolsEnabled } from '@/constants/appConfig';
import { useAuth } from '@/features/auth/hooks';
import { useAppTheme } from '@/theme/useAppTheme';

interface DrawerContentProps {
  closeDrawer: () => void;
}

// 菜单项组件
function MenuItem({
  icon,
  title,
  subtitle,
  onPress,
  hideBorder = false,
  tone,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  hideBorder?: boolean;
  tone: ReturnType<typeof useAppTheme>;
}) {
  return (
    <TouchableOpacity
      className="flex-row items-center px-sf-lg py-[14px]"
      style={[
        { borderBottomColor: tone.colors.border, borderBottomWidth: hideBorder ? 0 : 1 },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text className="mr-sf-md w-[26px] text-center text-xl">{icon}</Text>
      <View className="flex-1">
        <Text className="text-[15px] font-medium text-app-text dark:text-app-text-dark">{title}</Text>
        {subtitle ? (
          <Text className="mt-[2px] text-xs text-app-text-subtle dark:text-app-text-subtle-dark">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Text className="ml-sf-sm text-lg text-app-text-subtle dark:text-app-text-subtle-dark">›</Text>
    </TouchableOpacity>
  );
}

export function DrawerContent({ closeDrawer }: DrawerContentProps) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const theme = useAppTheme();
  const developerToolsEnabled = isDeveloperToolsEnabled();

  // 导航处理：先关闭抽屉，再跳转
  const handleNavigation = (route: string) => {
    closeDrawer();
    setTimeout(() => {
      router.push(route as any);
    }, 150);
  };

  return (
    <ScrollView
      className="flex-1 bg-app-surface dark:bg-app-surface-dark"
      contentContainerClassName="p-sf-lg pb-8"
      showsVerticalScrollIndicator={false}
    >
      {/* 用户信息卡片 */}
      <View
        className="mb-sf-lg flex-row items-center rounded-sf-lg bg-app-background p-sf-lg dark:bg-app-background-dark"
      >
        <View className="h-14 w-14 items-center justify-center rounded-full bg-app-primary-dark">
          <Text className="text-[28px]">👤</Text>
        </View>
        <View className="ml-[14px] flex-1">
          <Text className="mb-sf-xs text-lg font-semibold text-app-text dark:text-app-text-dark">
            {isAuthenticated ? user?.nickname || '测试博主' : '未登录'}
          </Text>
          <Text className="text-xs text-app-text-subtle dark:text-app-text-subtle-dark">
            {isAuthenticated ? `ID: ${user?.user_id}` : '点击登录'}
          </Text>
        </View>
      </View>

      {/* 菜单区块 1 */}
      <View className="mb-sf-md overflow-hidden rounded-sf-lg bg-black/[0.02] dark:bg-white/[0.04]">
        <MenuItem
          icon="📚"
          title="我的方法论"
          subtitle="知识库入口预留"
          onPress={() => {
            closeDrawer();
          }}
          tone={theme}
        />
        <MenuItem
          icon="📝"
          title="我的口播稿"
          subtitle="查看生成的口播稿"
          onPress={() => handleNavigation('/scripts')}
          hideBorder
          tone={theme}
        />
      </View>

      {developerToolsEnabled ? (
        <View className="mb-sf-md overflow-hidden rounded-sf-lg bg-black/[0.02] dark:bg-white/[0.04]">
          <MenuItem
            icon="🌐"
            title="网络设置"
            subtitle="配置后端服务地址"
            onPress={() => handleNavigation('/network-settings')}
            tone={theme}
          />
          <MenuItem
            icon="🔧"
            title="API 测试"
            subtitle="测试后端连接"
            onPress={() => handleNavigation('/test-api')}
            hideBorder
            tone={theme}
          />
        </View>
      ) : null}

      {/* 菜单区块 3 */}
      <View className="mb-sf-md overflow-hidden rounded-sf-lg bg-black/[0.02] dark:bg-white/[0.04]">
        <MenuItem
          icon="ℹ️"
          title="关于"
          subtitle="灵感编导 v1.0.0"
          onPress={() => {
            closeDrawer();
          }}
          hideBorder
          tone={theme}
        />
      </View>
    </ScrollView>
  );
}
