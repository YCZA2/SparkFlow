import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Keyboard, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { Text } from '@/components/Themed';
import { useAuth } from '@/features/auth/hooks';
import { useAppTheme } from '@/theme/useAppTheme';
import { getErrorMessage } from '@/utils/error';

export default function LoginScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { error, sessionStatus, registerWithEmail, loginWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.trim().length >= 8 && !isSubmitting;

  // 注册或登录
  const handleSubmit = async () => {
    try {
      Keyboard.dismiss();
      setIsSubmitting(true);

      if (isRegisterMode) {
        await registerWithEmail(email.trim(), password.trim(), nickname.trim() || undefined);
        Alert.alert('注册成功', '账号已创建并自动登录');
      } else {
        await loginWithEmail(email.trim(), password.trim());
      }

      router.replace('/');
    } catch (submitError) {
      Alert.alert(isRegisterMode ? '注册失败' : '登录失败', getErrorMessage(submitError, '请稍后重试'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer
      scrollable
      keyboardAvoiding
      contentContainerStyle={styles.screenContent}
    >
      <View style={styles.container}>
        <View style={styles.hero}>
          <Text style={[styles.title, { color: theme.colors.text }]}>登录 SparkFlow</Text>
          <Text style={[styles.subtitle, { color: theme.colors.textSubtle }]}>
            {isRegisterMode ? '创建账号后即可进入灵感库和脚本工作区' : '登录后才能进入灵感库、脚本工作区和全部 AI 能力。'}
          </Text>
          {sessionStatus === 'expired' || error ? (
            <Text style={[styles.notice, { color: theme.colors.warning }]}>
              {error || '当前登录态已失效，请重新登录。'}
            </Text>
          ) : null}
        </View>

        <View style={[styles.card, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.label, { color: theme.colors.textSubtle }]}>邮箱地址</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="请输入邮箱地址"
            placeholderTextColor={theme.colors.textMuted}
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
          />

          {isRegisterMode && (
            <>
              <Text style={[styles.label, { color: theme.colors.textSubtle }]}>昵称（可选）</Text>
              <TextInput
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
                placeholder="给自己起个名字"
                placeholderTextColor={theme.colors.textMuted}
                value={nickname}
                onChangeText={setNickname}
                returnKeyType="next"
              />
            </>
          )}

          <Text style={[styles.label, { color: theme.colors.textSubtle }]}>密码</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
            secureTextEntry
            autoCapitalize="none"
            placeholder={isRegisterMode ? '至少 8 位密码' : '请输入密码'}
            placeholderTextColor={theme.colors.textMuted}
            value={password}
            onChangeText={setPassword}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (canSubmit) {
                void handleSubmit();
              } else {
                Keyboard.dismiss();
              }
            }}
          />

          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: canSubmit ? theme.colors.text : theme.colors.border },
            ]}
            disabled={!canSubmit}
            onPress={handleSubmit}
          >
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? (isRegisterMode ? '注册中...' : '登录中...') : isRegisterMode ? '注册并进入工作区' : '登录并进入工作区'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchModeButton}
            onPress={() => {
              setIsRegisterMode(!isRegisterMode);
              setPassword('');
              setNickname('');
            }}
          >
            <Text style={[styles.switchModeText, { color: theme.colors.primary }]}>
              {isRegisterMode ? '已有账号？立即登录' : '没有账号？立即注册'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  hero: {
    gap: 10,
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  notice: {
    fontSize: 13,
    lineHeight: 20,
  },
  card: {
    borderRadius: 20,
    padding: 20,
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
  },
  primaryButton: {
    marginTop: 8,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  switchModeButton: {
    marginTop: 12,
    alignItems: 'center',
  },
  switchModeText: {
    fontSize: 14,
    fontWeight: '600',
  },
});