import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * 底部快捷操作栏 Context
 * 用于在页面之间共享底部按钮的状态，实现按钮"悬浮"在页面之上的效果
 */

interface QuickActionBarContextValue {
  /** 按钮栏是否可见 */
  visible: boolean;
  /** 当前所在的文件夹ID，undefined 表示在"全部"文件夹 */
  folderId: string | undefined;
  /** 设置按钮栏可见性 */
  setVisible: (visible: boolean) => void;
  /** 设置当前文件夹ID */
  setFolderId: (folderId: string | undefined) => void;
}

const QuickActionBarContext = createContext<QuickActionBarContextValue | null>(null);

/**
 * 底部快捷操作栏 Provider
 * 需要在 _layout.tsx 的顶层包裹应用，确保按钮组件可以访问上下文
 */
export function QuickActionBarProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [folderId, setFolderId] = useState<string | undefined>(undefined);

  const handleSetVisible = useCallback((v: boolean) => setVisible(v), []);
  const handleSetFolderId = useCallback((id: string | undefined) => setFolderId(id), []);

  return (
    <QuickActionBarContext.Provider
      value={{
        visible,
        folderId,
        setVisible: handleSetVisible,
        setFolderId: handleSetFolderId,
      }}
    >
      {children}
    </QuickActionBarContext.Provider>
  );
}

/**
 * 使用底部快捷操作栏上下文的 Hook
 * 必须在 QuickActionBarProvider 内部调用
 */
export function useQuickActionBar() {
  const context = useContext(QuickActionBarContext);
  if (!context) {
    throw new Error('useQuickActionBar must be used within QuickActionBarProvider');
  }
  return context;
}
