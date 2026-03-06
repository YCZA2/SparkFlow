/**
 * 我的页面 - 用户个人中心
 * 包含：我的方法论入口、网络设置、关于等
 */

import { StyleSheet, TouchableOpacity, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from '@/components/Themed';
import { useAuth } from '@/features/auth/hooks';
import { useAppTheme } from '@/theme/useAppTheme';

/**
 * 菜单项组件
 */
function MenuItem({
  icon,
  title,
  subtitle,
  onPress,
  tone,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  tone: ReturnType<typeof useAppTheme>;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.menuItem,
        { borderBottomColor: tone.colors.border },
      ]}
      onPress={onPress}
    >
      <Text style={styles.menuIcon}>{icon}</Text>
      <View style={styles.menuContent}>
        <Text style={[styles.menuTitle, { color: tone.colors.text }]}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.menuSubtitle, { color: tone.colors.textSubtle }]}>
            {subtitle}
          </Text>
        )}
      </View>
      <Text style={[styles.menuArrow, { color: tone.colors.textSubtle }]}>›</Text>
    </TouchableOpacity>
  );
}

/**
 * 我的页面
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const theme = useAppTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* 用户信息卡片 */}
      <View style={[styles.userCard, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
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

      {/* 功能菜单 */}
      <View style={[styles.menuSection, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
        <MenuItem
          icon="📚"
          title="我的方法论"
          subtitle="管理知识库文档"
          onPress={() => {}}
          tone={theme}
        />
        <MenuItem
          icon="📝"
          title="我的口播稿"
          subtitle="查看生成的口播稿"
          onPress={() => router.push('/scripts')}
          tone={theme}
        />
      </View>

      {/* 设置菜单 */}
      <View style={[styles.menuSection, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
        <MenuItem
          icon="🌐"
          title="网络设置"
          subtitle="配置后端服务地址"
          onPress={() => router.push('/network-settings')}
          tone={theme}
        />
        <MenuItem
          icon="🔧"
          title="API 测试"
          subtitle="测试后端连接"
          onPress={() => router.push('/test-api')}
          tone={theme}
        />
      </View>

      {/* 关于 */}
      <View style={[styles.menuSection, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
        <MenuItem
          icon="ℹ️"
          title="关于"
          subtitle="灵感编导 v1.0.0"
          onPress={() => {}}
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
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#0A84FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 32,
  },
  userInfo: {
    marginLeft: 16,
    flex: 1,
  },
  userName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 4,
  },
  userId: {
    fontSize: 13,
  },
  menuSection: {
    marginTop: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  menuIcon: {
    fontSize: 22,
    marginRight: 12,
    width: 28,
    textAlign: 'center',
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
  },
  menuSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  menuArrow: {
    fontSize: 20,
    marginLeft: 8,
  },
});
