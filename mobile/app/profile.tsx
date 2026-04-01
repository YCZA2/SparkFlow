import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { ScreenHeader } from '@/components/layout/ScreenHeader';
import { Text } from '@/components/Themed';
import { isDeveloperToolsEnabled } from '@/constants/appConfig';
import { useAuth } from '@/features/auth/hooks';
import { captureTaskExecutionScope } from '@/features/auth/taskScope';
import { restoreFromBackup } from '@/features/backups/restore';
import { useAppTheme } from '@/theme/useAppTheme';
import { getErrorMessage } from '@/utils/error';

function MenuItem({
  icon,
  title,
  subtitle,
  onPress,
  hideBorder = false,
  disabled = false,
  tone,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress: () => void;
  hideBorder?: boolean;
  disabled?: boolean;
  tone: ReturnType<typeof useAppTheme>;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.menuItem,
        {
          borderBottomColor: tone.colors.border,
          borderBottomWidth: hideBorder ? 0 : 1,
          opacity: disabled ? 0.55 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
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
  const { user, isAuthenticated, error, logout } = useAuth();
  const theme = useAppTheme();
  const developerToolsEnabled = isDeveloperToolsEnabled();
  const [isRestoring, setIsRestoring] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleRestore = useCallback(() => {
    /*通过显式确认触发恢复，避免静默覆盖本地 SQLite 真值。 */
    Alert.alert(
      '从备份恢复',
      '这会用远端备份覆盖当前本地 fragments / folders，未备份的本地改动不会保留。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '开始恢复',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setIsRestoring(true);
                const scope = captureTaskExecutionScope();
                const result = await restoreFromBackup('manual_profile_restore', { scope });
                Alert.alert(
                  '恢复完成',
                  `已恢复 ${result.fragmentCount} 条碎片、${result.folderCount} 个文件夹。`
                );
              } catch (error) {
                Alert.alert('恢复失败', getErrorMessage(error, '恢复失败，请稍后重试'));
              } finally {
                setIsRestoring(false);
              }
            })();
          },
        },
      ]
    );
  }, []);

  const handleLogout = useCallback(() => {
    /*账号中心里显式退出登录，切回登录页。 */
    void (async () => {
      try {
        setIsLoggingOut(true);
        await logout();
      } catch (logoutError) {
        Alert.alert('退出失败', getErrorMessage(logoutError, '退出登录失败，请稍后重试'));
      } finally {
        setIsLoggingOut(false);
      }
    })();
  }, [logout]);

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.pagePadding}>
          <ScreenHeader
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
                {isAuthenticated ? user?.nickname || user?.email?.split('@')[0] || '用户' : '未登录'}
              </Text>
              <Text style={[styles.userId, { color: theme.colors.textSubtle }]}>
                {isAuthenticated
                  ? user?.email || user?.user_id
                  : error || '请先登录后使用'}
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
              icon="🚪"
              title="退出登录"
              subtitle={
                isLoggingOut
                  ? '正在退出当前账号工作区'
                  : '退出后将返回登录页'
              }
              onPress={handleLogout}
              disabled={isLoggingOut || isRestoring}
              tone={theme}
            />
            <MenuItem
              icon="🛟"
              title="从备份恢复"
              subtitle={
                isRestoring
                  ? '正在拉取远端 snapshot 并重建本地数据库'
                  : '显式用远端备份覆盖当前本地 fragments / folders'
              }
              onPress={handleRestore}
              disabled={isRestoring || isLoggingOut}
              tone={theme}
            />
            {developerToolsEnabled ? (
              <>
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
                  disabled={isRestoring || isLoggingOut}
                  tone={theme}
                />
                <MenuItem
                  icon="🧯"
                  title="错误日志"
                  subtitle="查看前端运行时错误和接口异常"
                  onPress={() => router.push('/debug-logs')}
                  hideBorder
                  disabled={isRestoring || isLoggingOut}
                  tone={theme}
                />
              </>
            ) : (
              <MenuItem
                icon="ℹ️"
                title="正式环境"
                subtitle="网络设置、API 测试和错误日志仅在开发包开放"
                onPress={() => {}}
                hideBorder
                disabled
                tone={theme}
              />
            )}
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
