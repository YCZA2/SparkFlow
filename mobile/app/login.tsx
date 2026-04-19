import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Keyboard, TextInput, TouchableOpacity, View } from 'react-native';

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
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <View className="flex-1 justify-center px-5 pb-10">
        <View className="mb-sf-section gap-[10px]">
          <Text className="text-[32px] font-bold text-app-text dark:text-app-text-dark">登录 SparkFlow</Text>
          <Text className="text-[15px] leading-[22px] text-app-text-subtle dark:text-app-text-subtle-dark">
            {isRegisterMode ? '创建账号后即可进入灵感库和脚本工作区' : '登录后才能进入灵感库、脚本工作区和全部 AI 能力。'}
          </Text>
          {sessionStatus === 'expired' || error ? (
            <Text className="text-[13px] leading-5 text-app-warning dark:text-app-warning-dark">
              {error || '当前登录态已失效，请重新登录。'}
            </Text>
          ) : null}
        </View>

        <View className="gap-[10px] rounded-[20px] bg-app-surface p-5 dark:bg-app-surface-dark" style={theme.shadow.card}>
          <Text className="text-[13px] font-semibold text-app-text-subtle dark:text-app-text-subtle-dark">邮箱地址</Text>
          <TextInput
            className="rounded-[14px] border px-[14px] py-[14px] text-base text-app-text dark:text-app-text-dark"
            style={{ borderColor: theme.colors.border }}
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
              <Text className="text-[13px] font-semibold text-app-text-subtle dark:text-app-text-subtle-dark">昵称（可选）</Text>
              <TextInput
                className="rounded-[14px] border px-[14px] py-[14px] text-base text-app-text dark:text-app-text-dark"
                style={{ borderColor: theme.colors.border }}
                placeholder="给自己起个名字"
                placeholderTextColor={theme.colors.textMuted}
                value={nickname}
                onChangeText={setNickname}
                returnKeyType="next"
              />
            </>
          )}

          <Text className="text-[13px] font-semibold text-app-text-subtle dark:text-app-text-subtle-dark">密码</Text>
          <TextInput
            className="rounded-[14px] border px-[14px] py-[14px] text-base text-app-text dark:text-app-text-dark"
            style={{ borderColor: theme.colors.border }}
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
            className="mt-sf-sm items-center rounded-sf-lg py-sf-lg"
            style={[
              { backgroundColor: canSubmit ? theme.colors.text : theme.colors.border },
            ]}
            disabled={!canSubmit}
            onPress={handleSubmit}
          >
            <Text className="text-[15px] font-bold text-white">
              {isSubmitting ? (isRegisterMode ? '注册中...' : '登录中...') : isRegisterMode ? '注册并进入工作区' : '登录并进入工作区'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-sf-md items-center"
            onPress={() => {
              setIsRegisterMode(!isRegisterMode);
              setPassword('');
              setNickname('');
            }}
          >
            <Text className="text-sm font-semibold text-app-primary dark:text-app-primary-dark">
              {isRegisterMode ? '已有账号？立即登录' : '没有账号？立即注册'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenContainer>
  );
}
