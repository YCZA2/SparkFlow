/**
 * 我的页面 - 用户个人中心
 * 包含：我的方法论入口、网络设置、关于等
 */

import { StyleSheet, TouchableOpacity, useColorScheme, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { useAuth } from '@/hooks/useAuth';

/**
 * 菜单项组件
 */
function MenuItem({
  icon,
  title,
  subtitle,
  onPress,
  isDark,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  isDark: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.menuItem,
        { borderBottomColor: isDark ? '#3A3A3C' : '#E5E5EA' },
      ]}
      onPress={onPress}
    >
      <Text style={styles.menuIcon}>{icon}</Text>
      <View style={styles.menuContent}>
        <Text style={[styles.menuTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
          {title}
        </Text>
        {subtitle && (
          <Text style={[styles.menuSubtitle, { color: isDark ? '#8E8E93' : '#666666' }]}>
            {subtitle}
          </Text>
        )}
      </View>
      <Text style={[styles.menuArrow, { color: isDark ? '#8E8E93' : '#999999' }]}>›</Text>
    </TouchableOpacity>
  );
}

/**
 * 我的页面
 */
export default function ProfileScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: isDark ? '#000000' : '#F2F2F7' }]}
    >
      {/* 用户信息卡片 */}
      <View style={[styles.userCard, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>👤</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: isDark ? '#FFFFFF' : '#000000' }]}>
            {isAuthenticated ? user?.nickname || '测试博主' : '未登录'}
          </Text>
          <Text style={[styles.userId, { color: isDark ? '#8E8E93' : '#666666' }]}>
            {isAuthenticated ? `ID: ${user?.user_id}` : '点击登录'}
          </Text>
        </View>
      </View>

      {/* 功能菜单 */}
      <View style={[styles.menuSection, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
        <MenuItem
          icon="📚"
          title="我的方法论"
          subtitle="管理知识库文档"
          onPress={() => {}}
          isDark={isDark}
        />
        <MenuItem
          icon="📝"
          title="我的口播稿"
          subtitle="查看生成的口播稿"
          onPress={() => router.push('/scripts')}
          isDark={isDark}
        />
      </View>

      {/* 设置菜单 */}
      <View style={[styles.menuSection, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
        <MenuItem
          icon="🌐"
          title="网络设置"
          subtitle="配置后端服务地址"
          onPress={() => router.push('/network-settings')}
          isDark={isDark}
        />
        <MenuItem
          icon="🔧"
          title="API 测试"
          subtitle="测试后端连接"
          onPress={() => router.push('/test-api')}
          isDark={isDark}
        />
      </View>

      {/* 关于 */}
      <View style={[styles.menuSection, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>
        <MenuItem
          icon="ℹ️"
          title="关于"
          subtitle="灵感编导 v1.0.0"
          onPress={() => {}}
          isDark={isDark}
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
    backgroundColor: '#007AFF',
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
