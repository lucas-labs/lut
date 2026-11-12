import { hasUnsavedChanges, useNavigationStore } from '@/modules/navigation';
import { closeWindow as closeAppWindow, onWindowCloseRequested } from '@/modules/platform';
import { usePreferencesStore } from '@/modules/settings/preferences';
import type { Tab } from '@/modules/tabs';
import { leafHasForegroundProcess, leafIds } from '@/modules/terminal';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

async function anyTerminalBusy(tabs: Tab[]): Promise<boolean> {
  const leaves = tabs.flatMap((t) => (t.kind === 'terminal' ? leafIds(t.paneTree) : []));
  if (leaves.length === 0) return false;
  const checks = await Promise.all(leaves.map(leafHasForegroundProcess));
  return checks.some(Boolean);
}

export type AppCloseBlocker = {
  dirtyEditors: number;
  busyTerminal: boolean;
};

/**
 * The opt-out only covers running processes, so it stays hidden whenever the
 * same prompt is also the last warning before discarding unsaved buffers.
 */
export function canOptOutOfAppClosePrompt(blocker: AppCloseBlocker): boolean {
  return blocker.busyTerminal && blocker.dirtyEditors === 0;
}

export function useAppCloseGuard() {
  const [pendingAppClose, setPendingAppClose] = useState<AppCloseBlocker | null>(null);
  const forceClose = useRef(false);
  const closing = useRef(false);
  const closeWindow = useCallback(async () => {
    forceClose.current = true;
    try {
      await closeAppWindow();
    } catch (error) {
      forceClose.current = false;
      toast.error('Could not close the window', {
        description: String(error),
      });
    }
  }, []);
  const finishClose = useCallback(async () => {
    if (closing.current) return;
    closing.current = true;
    try {
      await closeWindow();
    } finally {
      closing.current = false;
    }
  }, [closeWindow]);

  useEffect(() => {
    return onWindowCloseRequested(async (event) => {
      if (forceClose.current) return;
      event.preventDefault();
      // Opting out skips the per-leaf IPC entirely; it never relaxes the
      // unsaved-changes guard below.
      const busyTerminal =
        usePreferencesStore.getState().confirmCloseRunningTerminal &&
        (await anyTerminalBusy(useNavigationStore.getState().tabs));
      // Count after the await so edits made during the IPC check are seen.
      const dirtyEditors = useNavigationStore.getState().tabs.filter(hasUnsavedChanges).length;
      if (dirtyEditors > 0 || busyTerminal) {
        setPendingAppClose({ dirtyEditors, busyTerminal });
      } else {
        void finishClose();
      }
    });
  }, [finishClose]);

  const confirmAppClose = useCallback(() => {
    setPendingAppClose(null);
    void finishClose();
  }, [finishClose]);

  const cancelAppClose = useCallback(() => setPendingAppClose(null), []);

  return { pendingAppClose, confirmAppClose, cancelAppClose };
}
