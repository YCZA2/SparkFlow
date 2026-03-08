import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text } from '@/components/Themed';
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
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onCancel}
        />
        <View
          style={[
            styles.container,
            {
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radius.lg,
            },
          ]}
        >
          {/* 标题 */}
          <Text
            style={[
              styles.title,
              { color: theme.colors.text },
            ]}
          >
            {title}
          </Text>

          {/* 输入框 */}
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: theme.colors.surfaceMuted,
                color: theme.colors.text,
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
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.button}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: theme.colors.textSubtle },
                ]}
              >
                {cancelText}
              </Text>
            </TouchableOpacity>
            <View
              style={[
                styles.divider,
                { backgroundColor: theme.colors.border },
              ]}
            />
            <TouchableOpacity
              style={styles.button}
              onPress={handleConfirm}
              activeOpacity={0.7}
              disabled={!text.trim()}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: text.trim() ? theme.colors.primary : theme.colors.textSubtle },
                ]}
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  container: {
    width: 280,
    overflow: 'hidden',
    zIndex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  input: {
    height: 40,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#C8C7CC',
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#C8C7CC',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '400',
  },
});
