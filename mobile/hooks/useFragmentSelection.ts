import { useMemo, useState } from 'react';

export function useFragmentSelection(maxSelection = 20) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const selectedCount = selectedIds.length;
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const toggleSelectionMode = () => {
    setIsSelectionMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedIds([]);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds([]);

  const toggleSelect = (id: string) => {
    let blocked = false;
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= maxSelection) {
        blocked = true;
        return prev;
      }
      return [...prev, id];
    });
    return !blocked;
  };

  return {
    isSelectionMode,
    selectedIds,
    selectedCount,
    selectedSet,
    maxSelection,
    toggleSelectionMode,
    toggleSelect,
    clearSelection,
  };
}
