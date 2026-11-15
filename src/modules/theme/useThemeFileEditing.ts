import { useNavigationStore } from '@/modules/navigation';
import { setThemeId as persistThemeId } from '@/modules/settings/store';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { listCustomThemes, saveCustomTheme } from './customThemes';
import {
  isThemeFilePath,
  onThemeEdit,
  readThemeFile,
  starterTheme,
  themeFileName,
  themeFilePath,
  writeThemeFile,
} from './themeFiles';

type Params = {
  openFileTab: (path: string) => void;
};

/**
 * Applies a theme file the editor just saved. A file that does not parse leaves the theme as it was and says why in
 * a toast; Settings shows the same error on the theme's card.
 */
async function ingestThemeFile(path: string): Promise<void> {
  const parsed = await readThemeFile(path);
  const error = parsed.ok
    ? await saveCustomTheme(parsed.theme).then(
        () => null,
        (e: unknown) => (e instanceof Error ? e.message : String(e)),
      )
    : parsed.error;
  if (error) toast.error(`Couldn't apply ${themeFileName(path)}`, { description: error });
}

/**
 * A custom theme is materialized to a real file and edited in the code editor.
 * Saving it re-ingests into the runtime store + applies live; the edit request
 * channel opens (or creates) the theme file for editing.
 */
export function useThemeFileEditing({ openFileTab }: Params) {
  useEffect(() => {
    type FileWrittenPayload = { path: string; source?: string };
    const unlistenPromise = getCurrentWebviewWindow().listen<FileWrittenPayload>(
      'fs:file-written',
      (event) => {
        if (event.payload.source !== 'editor') return;
        if (!isThemeFilePath(event.payload.path)) return;
        void ingestThemeFile(event.payload.path);
      },
    );
    return () => {
      void unlistenPromise.then((un) => un());
    };
  }, []);

  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | undefined;
    void onThemeEdit(async (req) => {
      const theme =
        req.action === 'create'
          ? starterTheme()
          : (await listCustomThemes()).find((t) => t.id === req.id);
      if (!theme) return;
      if (req.action === 'create') await saveCustomTheme(theme);
      const path = await themeFilePath(theme.id);
      const open = useNavigationStore
        .getState()
        .tabs.some((t) => t.kind === 'editor' && t.path === path);
      if (!open) await writeThemeFile(theme);
      void persistThemeId(theme.id);
      openFileTab(path);
      void getCurrentWebviewWindow().setFocus();
    }).then((fn) => {
      if (alive) unsub = fn;
      else fn();
    });
    return () => {
      alive = false;
      unsub?.();
    };
  }, [openFileTab]);
}
