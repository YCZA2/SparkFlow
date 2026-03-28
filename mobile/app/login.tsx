import React, { useRef, useState } from 'react';
import { Alert, Keyboard, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { Text } from '@/components/Themed';
import { useAuth } from '@/features/auth/hooks';
import { useAppTheme } from '@/theme/useAppTheme';
import { getErrorMessage } from '@/utils/error';

export default function LoginScreen() {
  const theme = useAppTheme();
  const { error, sessionStatus, loginWithEmailPassword } = useAuth();
  const passwordInputRef = useRef<TextInput | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 简单校验邮箱格式和密码长度（至少 8 位）。
  const canSubmit = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && password.length >= 8 && !isSubmitting;

  // 提交邮箱和密码登录，成功后由根路由的受保护导航自动切到工作区首页。
  const handleLogin = async () => {
    try {
      Keyboard.dismiss();
      setIsSubmitting(true);
      await loginWithEmailPassword(email.trim(), password);
    } catch (loginError) {
      Alert.alert('登录失败', getErrorMessage(loginError, '邮箱或密码不正确，请重试'));
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
            登录后才能进入灵感库、脚本工作区和全部 AI 能力。
          </Text>
          {sessionStatus === 'expired' || error ? (
            <Text style={[styles.notice, { color: theme.colors.warning }]}>
              {error || '当前登录态已失效，请重新登录。'}
            </Text>
          ) : null}
        </View>

        <View style={[styles.card, theme.shadow.card, { backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.label, { color: theme.colors.textSubtle }]}>邮箱</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="请输入注册邮箱"
            placeholderTextColor={theme.colors.textMuted}
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
            onSubmitEditing={() => passwordInputRef.current?.focus()}
          />

          <Text style={[styles.label, { color: theme.colors.textSubtle }]}>密码</Text>
          <TextInput
            ref={passwordInputRef}
            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
            secureTextEntry
            autoComplete="password"
            placeholder="请输入密码（至少 8 位）"
            placeholderTextColor={theme.colors.textMuted}
            value={password}
            onChangeText={setPassword}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (canSubmit) {
                void handleLogin();
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
            onPress={handleLogin}
          >
            <Text style={styles.primaryButtonText}>{isSubmitting ? '登录中...' : '登录并进入工作区'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    justifyContent: 'center',
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
});
