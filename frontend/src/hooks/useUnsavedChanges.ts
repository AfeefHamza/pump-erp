// frontend/src/hooks/useUnsavedChanges.ts
import { useEffect, useCallback } from 'react';

export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const confirmNavigation = useCallback(
    (onConfirm: () => void) => {
      if (!isDirty) {
        onConfirm();
        return;
      }

      if (window.confirm('You have unsaved changes. Are you sure you want to leave this page?')) {
        onConfirm();
      }
    },
    [isDirty]
  );

  return { confirmNavigation };
}
