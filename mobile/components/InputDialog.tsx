import React, { useState, useEffect } from 'react';
import { Modal, View, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, Text } from 'react-native';
import { useAppTheme } from '@/theme/useAppTheme';

interface InputDialogProps {
  /** 是否可见 */
  visible: boolean;
  /** 对话框标题 */
  title: string;
  /** 输入框占位文本 */
  placeholder?: string;
  /** 确认按钮文本 */
  confirmText?: string;
  /** 取消按钮文本 */
  cancelText?: string;
  /** 确认回调 */
  onConfirm: (text: string) => void;
  /** 取消回调 */
  onCancel: () => void;
}

/**
 * 输入对话框组件
 * 用于需要用户输入文本的场景，如新建文件夹命名
 */
export function InputDialog({
  visible,
  title,
  placeholder = '',
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
}: InputDialogProps) {
  const theme = useAppTheme();
  const [text, setText] = useState('');

  // 打开时重置输入
  useEffect(() => {
    if (visible) {
      setText('');
    }
  }, [visible]);

  const handleConfirm = () => {
    const trimmed = text.trim();
    if (trimmed) {
      onConfirm(trimmed);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 items-center justify-center"
      >
        <TouchableOpacity
          className="absolute inset-0 bg-black/40"
          activeOpacity={1}
          onPress={onCancel}
        />
        <View
          className="z-[1] w-[280px] overflow-hidden rounded-sf-lg bg-app-surface dark:bg-app-surface-dark"
          style={[
            {
            },
          ]}
        >
          {/* 标题 */}
          <Text
            className="px-5 pb-sf-lg pt-5 text-center text-[17px] font-semibold text-app-text dark:text-app-text-dark"
          >
            {title}
          </Text>

          {/* 输入框 */}
          <TextInput
            className="mx-sf-lg mb-sf-lg h-10 rounded-sf-sm border px-sf-md text-base bg-app-surface-muted text-app-text dark:bg-app-surface-muted-dark dark:text-app-text-dark"
            style={[
              {
                borderColor: theme.colors.border,
              },
            ]}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textSubtle}
            value={text}
            onChangeText={setText}
            autoFocus
            maxLength={50}
          />

          {/* 按钮组 */}
          <View className="flex-row border-t" style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border }}>
            <TouchableOpacity
              className="flex-1 items-center justify-center py-sf-md"
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text
                className="text-[17px] font-normal text-app-text-subtle dark:text-app-text-subtle-dark"
              >
                {cancelText}
              </Text>
            </TouchableOpacity>
            <View
              style={{
                width: StyleSheet.hairlineWidth,
                backgroundColor: theme.colors.border,
              }}
            />
            <TouchableOpacity
              className="flex-1 items-center justify-center py-sf-md"
              onPress={handleConfirm}
              activeOpacity={0.7}
              disabled={!text.trim()}
            >
              <Text
                className="text-[17px] font-normal"
                style={{ color: text.trim() ? theme.colors.primary : theme.colors.textSubtle }}
              >
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
