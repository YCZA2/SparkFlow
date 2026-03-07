import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Text } from '@/components/Themed';
import { useAuth } from '@/features/auth/hooks';
import { useAppTheme } from '@/theme/useAppTheme';

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

export default function ProfileScreen() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const theme = useAppTheme();

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pagePadding}>
          <ScreenHeader
            eyebrow="我的"
            title="创作工作台"
            subtitle="查看你的身份、稿件入口和基础设置。"
          />

          <View
            style={[
              styles.userCard,
              theme.shadow.card,
              { backgroundColor: theme.colors.surface },
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

          <View
            style={[
              styles.menuSection,
              theme.shadow.card,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <MenuItem
              icon="📚"
              title="我的方法论"
              subtitle="知识库入口预留，后续接入管理能力"
              onPress={() => {}}
              tone={theme}
            />
            <MenuItem
              icon="📝"
              title="我的口播稿"
              subtitle="查看生成的口播稿"
              onPress={() => router.push('/scripts')}
              hideBorder
              tone={theme}
            />
          </View>

          <View
            style={[
              styles.menuSection,
              theme.shadow.card,
              { backgroundColor: theme.colors.surface },
            ]}
          >
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
              hideBorder
              tone={theme}
            />
          </View>

          <View
            style={[
              styles.menuSection,
              theme.shadow.card,
              { backgroundColor: theme.colors.surface },
            ]}
          >
            <MenuItem
              icon="ℹ️"
              title="关于"
              subtitle="灵感编导 v1.0.0"
              onPress={() => {}}
              hideBorder
              tone={theme}
            />
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 24,
  },
  pagePadding: {
    paddingHorizontal: 16,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
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
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
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
