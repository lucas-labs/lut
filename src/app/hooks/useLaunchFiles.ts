import { consumeLaunchFiles } from '@/lib/launchDir';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect } from 'react';

type LaunchFilesArgs = {
  /** The spaces restore has finished, so tabs opened now stay. */
  booted: boolean;
  openFile: (path: string, pin: boolean) => void;
};

/**
 * Opens the files lut was launched with (cold start, once the spaces restore is done) and those the OS sends while
 * it runs (macOS "Open With") (E09-02).
 */
export function useLaunchFiles({ booted, openFile }: LaunchFilesArgs): void {
  const openLaunchFiles = useCallback(
    (paths: string[]) => {
      for (const path of paths) openFile(path, true);
    },
    [openFile],
  );

  // Warm start: the backend emits once the window already exists. Attach on
  // mount so an "Open With" that lands mid-restore isn't dropped — the backend
  // also seeds the drain-once state, so the boot drain below is the safety net.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    (async () => {
      const off = await listen<string[]>('lut:open-file', (e) => {
        openLaunchFiles(e.payload);
      });
      if (disposed) off();
      else unlisten = off;
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [openLaunchFiles]);

  // Cold start: files arrive as CLI args (Linux/Windows) or the macOS open-files
  // event, and get_launch_files drains them once. Wait for `booted` — the spaces
  // restore ends in replaceTabs(), which overwrites the whole tab list and would
  // discard a launch tab opened before it, making the file flash open and vanish.
  // Booting first also lands the tab in the restored active space, and lets
  // openFileTab dedupe against a session that already had the file open.
  useEffect(() => {
    if (!booted) return;
    void (async () => {
      openLaunchFiles(await consumeLaunchFiles());
    })();
  }, [booted, openLaunchFiles]);
}
