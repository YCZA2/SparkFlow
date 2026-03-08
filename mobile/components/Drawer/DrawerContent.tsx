/**
 * DrawerContent - 抽屉菜单内容
 * 从 profile.tsx 提取的用户信息和菜单项
 */
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { Text } from '@/components/Themed';
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
      style={[
        styles.menuItem,
        { borderBottomColor: tone.colors.border, borderBottomWidth: hideBorder ? 0 : 1 },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.menuIcon}>{icon}</Text>
      <View style={styles.menuContent}>
        <Text style={[styles.menuTitle, { color: tone.colors.text }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.menuSubtitle, { color: tone.colors.textSubtle }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.menuArrow, { color: tone.colors.textSubtle }]}>›</Text>
    </TouchableOpacity>
  );
}

export function DrawerContent({ closeDrawer }: DrawerContentProps) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const theme = useAppTheme();

  // 导航处理：先关闭抽屉，再跳转
  const handleNavigation = (route: string) => {
    closeDrawer();
    setTimeout(() => {
      router.push(route as any);
    }, 150);
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.surface }]}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* 用户信息卡片 */}
      <View
        style={[
          styles.userCard,
          { backgroundColor: theme.colors.background, borderRadius: 16 },
        ]}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>👤</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: theme.colors.text }]}>
            {isAuthenticated ? user?.nickname || '测试博主' : '未登录'}
          </Text>
          <Text style={[styles.userId, { color: theme.colors.textSubtle }]}>
            {isAuthenticated ? `ID: ${user?.user_id}` : '点击登录'}
          </Text>
        </View>
      </View>

      {/* 菜单区块 1 */}
      <View style={[styles.menuSection, { borderRadius: 16 }]}>
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

      {/* 菜单区块 2 */}
      <View style={[styles.menuSection, { borderRadius: 16 }]}>
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

      {/* 菜单区块 3 */}
      <View style={[styles.menuSection, { borderRadius: 16 }]}>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0A84FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 28,
  },
  userInfo: {
    marginLeft: 14,
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  userId: {
    fontSize: 12,
  },
  menuSection: {
    marginBottom: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 26,
    textAlign: 'center',
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  menuSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  menuArrow: {
    fontSize: 18,
    marginLeft: 8,
  },
});