import React, { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';

import { ScreenContainer } from '@/components/layout/ScreenContainer';
import { Text } from '@/components/Themed';
import { useAuth } from '@/features/auth/hooks';
import { useAppTheme } from '@/theme/useAppTheme';
import { getErrorMessage } from '@/utils/error';

export default function LoginScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { error, sessionStatus, requestVerificationCode, loginWithPhoneCode } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSend = useMemo(() => /^1\d{10}$/.test(phoneNumber), [phoneNumber]);
  const canSubmit = useMemo(
    () => canSend && verificationCode.trim().length >= 4 && !isSubmitting,
    [canSend, isSubmitting, verificationCode]
  );

  const handleSendCode = async () => {
    try {
      setIsSending(true);
      const result = await requestVerificationCode(phoneNumber.trim());
      setDebugCode(result.debug_code ?? null);
      Alert.alert('验证码已发送', result.debug_code ? `开发环境验证码：${result.debug_code}` : '请查看短信后输入验证码');
    } catch (sendError) {
      Alert.alert('发送失败', getErrorMessage(sendError, '验证码发送失败'));
    } finally {
      setIsSending(false);
    }
  };

  const handleLogin = async () => {
    try {
      setIsSubmitting(true);
      await loginWithPhoneCode(phoneNumber.trim(), verificationCode.trim());
      router.replace('/');
    } catch (loginError) {
      Alert.alert('登录失败', getErrorMessage(loginError, '登录失败，请稍后重试'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
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
          <Text style={[styles.label, { color: theme.colors.textSubtle }]}>手机号</Text>
          <TextInput
            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text }]}
            keyboardType="number-pad"
            maxLength={11}
            placeholder="请输入 11 位手机号"
            placeholderTextColor={theme.colors.textMuted}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
          />

          <Text style={[styles.label, { color: theme.colors.textSubtle }]}>验证码</Text>
          <View style={styles.codeRow}>
            <TextInput
              style={[
                styles.input,
                styles.codeInput,
                { borderColor: theme.colors.border, color: theme.colors.text },
              ]}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="请输入验证码"
              placeholderTextColor={theme.colors.textMuted}
              value={verificationCode}
              onChangeText={setVerificationCode}
            />
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                {
                  backgroundColor: canSend && !isSending ? theme.colors.primary : theme.colors.border,
                },
              ]}
              disabled={!canSend || isSending}
              onPress={handleSendCode}
            >
              <Text style={styles.secondaryButtonText}>{isSending ? '发送中' : '获取验证码'}</Text>
            </TouchableOpacity>
          </View>

          {debugCode ? (
            <Text style={[styles.debugCode, { color: theme.colors.textSubtle }]}>
              开发环境验证码：{debugCode}
            </Text>
          ) : null}

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
  codeRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  codeInput: {
    flex: 1,
  },
  secondaryButton: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  debugCode: {
    fontSize: 12,
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
