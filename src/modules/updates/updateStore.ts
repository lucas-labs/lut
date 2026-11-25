import { usePreferencesStore } from '@/modules/settings/preferences';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { Update } from '@tauri-apps/plugin-updater';
import { create } from 'zustand';
import { isCheckDue, resolveChannel } from './schedule';

type UpdateMetadata = ConstructorParameters<typeof Update>[0];

export type UpdateStatus = 'idle' | 'checking' | 'upToDate' | 'available' | 'error';

/**
 * Where the update dialog is (E25-06): closed, offering the release, downloading it, `ready` when the download is
 * done but restarting would lose work, installing, or `failed` with nothing installed.
 */
export type UpdateDialogPhase =
  'closed' | 'offer' | 'downloading' | 'ready' | 'installing' | 'failed';

/** Bytes downloaded so far; `total` is `null` when the server sends no size. */
export type DownloadProgress = { downloaded: number; total: number | null };

/** The warning before restarting, or `null` when restarting loses nothing (the app's close guard). */
export type RestartBlocker = () => Promise<string | null>;

interface State {
  status: UpdateStatus;
  /** The newer release, while `status` is `available`. */
  update: Update | null;
  error: string | null;
  phase: UpdateDialogPhase;
  progress: DownloadProgress | null;
  /** What restarting would lose, shown in the `ready` phase. */
  blocker: string | null;
  installError: string | null;
  /** Checks the channel's manifest. Never when updates are off; an automatic check waits for the interval. */
  checkForUpdates: (options?: { manual?: boolean }) => Promise<void>;
  /** Later, Cancel or Close: closes the dialog; the next check offers the release again. Not while it downloads. */
  dismiss: () => void;
  /** Downloads the release, then installs and restarts unless restarting would lose work. */
  install: (restartBlocker: RestartBlocker) => Promise<void>;
  /** Installs the downloaded release and restarts, whatever restarting loses. */
  restartNow: () => Promise<void>;
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

/** A download or an install is under way: a check now would replace the release being installed. */
const busy = (phase: UpdateDialogPhase) =>
  phase === 'downloading' || phase === 'ready' || phase === 'installing';

export const useUpdateStore = create<State>((set, get) => {
  /** Installs the downloaded release; Windows' installer quits and restarts lut, elsewhere lut restarts itself. */
  const installAndRestart = async (update: Update) => {
    set({ phase: 'installing' });
    await update.install();
    await invoke('updates_restart');
  };

  return {
    status: 'idle',
    update: null,
    error: null,
    phase: 'closed',
    progress: null,
    blocker: null,
    installError: null,

    checkForUpdates: async ({ manual = false } = {}) => {
      const { updatesEnabled, updateChannel } = usePreferencesStore.getState();
      if (!updatesEnabled || get().status === 'checking' || busy(get().phase)) return;
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
            ? {
                status: 'available',
                update: new Update(metadata),
                phase: 'offer',
                installError: null,
              }
            : { status: 'upToDate', update: null, phase: 'closed' },
        );
        void previous?.close();
      } catch (error) {
        set({ status: 'error', error: String(error) });
      }
    },

    dismiss: () => {
      const { phase } = get();
      if (phase !== 'downloading' && phase !== 'installing')
        set({ phase: 'closed', blocker: null });
    },

    install: async (restartBlocker) => {
      const { update, phase } = get();
      if (!update || busy(phase)) return;
      set({ phase: 'downloading', progress: { downloaded: 0, total: null }, installError: null });
      try {
        await update.download((event) => {
          const progress = get().progress ?? { downloaded: 0, total: null };
          if (event.event === 'Started') {
            set({ progress: { downloaded: 0, total: event.data.contentLength ?? null } });
          } else if (event.event === 'Progress') {
            set({
              progress: { ...progress, downloaded: progress.downloaded + event.data.chunkLength },
            });
          }
        });
        const blocker = await restartBlocker();
        if (blocker) {
          set({ phase: 'ready', blocker });
          return;
        }
        await installAndRestart(update);
      } catch (error) {
        set({ phase: 'failed', installError: String(error) });
      }
    },

    restartNow: async () => {
      const { update, phase } = get();
      if (!update || phase !== 'ready') return;
      try {
        await installAndRestart(update);
      } catch (error) {
        set({ phase: 'failed', installError: String(error) });
      }
    },
  };
});
