/**
 * ErrorBoundary 组件
 * 捕获 React 组件渲染错误，防止应用崩溃
 */

import React, { Component, ReactNode } from 'react';
import { TouchableOpacity, Text, View } from 'react-native';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 错误边界组件
 * 捕获子组件树中的 JavaScript 错误，显示备用 UI
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    // 更新状态，使下一次渲染显示备用 UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 记录错误信息
    console.error('ErrorBoundary 捕获到错误:', error);
    console.error('错误信息:', errorInfo.componentStack);

    // 调用外部错误处理回调
    this.props.onError?.(error, errorInfo);
  }

  /**
   * 重置错误状态，尝试重新渲染
   */
  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误 UI
      return (
        <View className="flex-1 items-center justify-center p-5">
          <Text className="mb-sf-lg text-[64px]">😵</Text>
          <Text className="mb-sf-sm text-2xl font-bold text-app-text dark:text-app-text-dark">出错了</Text>
          <Text className="mb-sf-section text-center text-sm text-app-text-muted dark:text-app-text-muted-dark">
            {this.state.error?.message || '发生了未知错误'}
          </Text>
          <TouchableOpacity
            className="rounded-sf-sm bg-app-primary px-sf-section py-sf-md dark:bg-app-primary-dark"
            onPress={this.handleRetry}
          >
            <Text className="text-base font-semibold text-white">点击重试</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

/**
 * 便捷 Hook：在函数组件中使用错误边界
 * 注意：实际上错误边界必须是类组件，此 Hook 仅作为标记
 */
export function useErrorBoundary() {
  return {
    /**
     * 重新抛出错误，让最近的 ErrorBoundary 捕获
     */
    throwError: (error: Error) => {
      throw error;
    },
  };
}
