/**
 * DrawerProvider - 抽屉菜单状态管理
 * 提供全局的抽屉开关状态和控制方法
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface DrawerContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const DrawerContext = createContext<DrawerContextValue | null>(null);

/**
 * DrawerProvider - 包裹应用以提供抽屉状态
 */
export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const value = useMemo<DrawerContextValue>(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle]
  );

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

/**
 * useDrawer - 访问抽屉状态的 Hook
 */
export function useDrawer() {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error('useDrawer must be used within a DrawerProvider');
  }
  return context;
}