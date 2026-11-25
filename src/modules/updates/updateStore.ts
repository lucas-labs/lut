import { usePreferencesStore } from '@/modules/settings/preferences';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { Update } from '@tauri-apps/plugin-updater';
import { create } from 'zustand';
import { isCheckDue, resolveChannel } from './schedule';

type UpdateMetadata = ConstructorParameters<typeof Update>[0];

export type UpdateStatus = 'idle' | 'checking' | 'upToDate' | 'available' | 'error';

interface State {
  status: UpdateStatus;
  /** The newer release, while `status` is `available`; downloaded and installed by the update dialog (E25-06). */
  update: Update | null;
  error: string | null;
  /** Checks the channel's manifest. Never when updates are off; an automatic check waits for the interval. */
  checkForUpdates: (options?: { manual?: boolean }) => Promise<void>;
}

/** When lut last checked, per identity (a dev build has its own storage). */
const LAST_CHECK_KEY = 'lut.updates.lastCheck';

function readLastCheck(): number | null {
  try {
    const value = Number(window.localStorage.getItem(LAST_CHECK_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeLastCheck(value: number): void {
  try {
    window.localStorage.setItem(LAST_CHECK_KEY, String(value));
  } catch {
    // Without storage every start checks again; nothing else changes.
  }
}

/** Makes the next automatic check run, e.g. after the channel changed. */
export function clearLastCheck(): void {
  try {
    window.localStorage.removeItem(LAST_CHECK_KEY);
  } catch {
    // Nothing stored to clear.
  }
}

export const useUpdateStore = create<State>((set, get) => ({
  status: 'idle',
  update: null,
  error: null,
  checkForUpdates: async ({ manual = false } = {}) => {
    const { updatesEnabled, updateChannel } = usePreferencesStore.getState();
    if (!updatesEnabled || get().status === 'checking') return;
    const now = Date.now();
    if (!manual && !isCheckDue(readLastCheck(), now)) return;
    writeLastCheck(now);
    set({ status: 'checking', error: null });
    try {
      const channel = resolveChannel(updateChannel, await getVersion());
      const metadata = await invoke<UpdateMetadata | null>('updates_check', { channel });
      const previous = get().update;
      set(
        metadata
          ? { status: 'available', update: new Update(metadata) }
          : { status: 'upToDate', update: null },
      );
      void previous?.close();
    } catch (error) {
      set({ status: 'error', error: String(error) });
    }
  },
}));
