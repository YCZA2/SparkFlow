import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface ImportActionSheetContextValue {
  isOpen: boolean;
  folderId: string | undefined;
  open: (folderId?: string) => void;
  close: () => void;
}

const ImportActionSheetContext = createContext<ImportActionSheetContextValue | null>(null);

/**
 管理底部导入抽屉的开关与当前文件夹上下文。
 */
export function ImportActionSheetProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [folderId, setFolderId] = useState<string | undefined>(undefined);

  const open = useCallback((nextFolderId?: string) => {
    setFolderId(nextFolderId);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo<ImportActionSheetContextValue>(
    () => ({ isOpen, folderId, open, close }),
    [close, folderId, isOpen, open]
  );

  return (
    <ImportActionSheetContext.Provider value={value}>
      {children}
    </ImportActionSheetContext.Provider>
  );
}

/**
 读取底部导入抽屉的全局状态。
 */
export function useImportActionSheet() {
  const context = useContext(ImportActionSheetContext);
  if (!context) {
    throw new Error('useImportActionSheet must be used within ImportActionSheetProvider');
  }
  return context;
}
