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

/**
 * What quitting now would lose: unsaved editors, and a running process unless the user opted out of that prompt.
 * `null` when nothing. Used when the window closes and before an update restarts lut (E25-06).
 */
async function currentAppCloseBlocker(): Promise<AppCloseBlocker | null> {
  // Opting out skips the per-leaf IPC entirely; it never relaxes the unsaved-changes guard below.
  const busyTerminal =
    usePreferencesStore.getState().confirmCloseRunningTerminal &&
    (await anyTerminalBusy(useNavigationStore.getState().tabs));
  // Count after the await so edits made during the IPC check are seen.
  const dirtyEditors = useNavigationStore.getState().tabs.filter(hasUnsavedChanges).length;
  return dirtyEditors > 0 || busyTerminal ? { dirtyEditors, busyTerminal } : null;
}

/** The warning for a blocker, for quitting or for restarting to install an update. */
export function appCloseMessage(
  blocker: AppCloseBlocker,
  action: 'Quitting' | 'Restarting' = 'Quitting',
): string {
  const dirty =
    blocker.dirtyEditors === 1
      ? '1 file has unsaved changes'
      : `${blocker.dirtyEditors} files have unsaved changes`;
  if (blocker.dirtyEditors > 0 && blocker.busyTerminal) {
    return `A process is still running and ${dirty}. ${action} will terminate it and discard the changes.`;
  }
  if (blocker.dirtyEditors > 0) {
    return `${dirty.charAt(0).toUpperCase()}${dirty.slice(1)}. ${action} will discard them.`;
  }
  return `A process is still running in a terminal. ${action} will terminate it.`;
}

/** The warning before an update restarts lut, or `null` when restarting loses nothing. */
export async function restartBlockerMessage(): Promise<string | null> {
  const blocker = await currentAppCloseBlocker();
  return blocker ? appCloseMessage(blocker, 'Restarting') : null;
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
    await closeWindow().finally(() => {
      closing.current = false;
    });
  }, [closeWindow]);

  useEffect(() => {
    return onWindowCloseRequested(async (event) => {
      if (forceClose.current) return;
      event.preventDefault();
      const blocker = await currentAppCloseBlocker();
      if (blocker) setPendingAppClose(blocker);
      else void finishClose();
    });
  }, [finishClose]);

  const confirmAppClose = useCallback(() => {
    setPendingAppClose(null);
    void finishClose();
  }, [finishClose]);

  const cancelAppClose = useCallback(() => setPendingAppClose(null), []);

  return { pendingAppClose, confirmAppClose, cancelAppClose };
}
