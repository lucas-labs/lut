import { currentWorkspaceEnv } from '@/modules/workspace';
import { invoke } from '@tauri-apps/api/core';
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { createContext } from 'react';
import { toast } from 'sonner';

/** What the preview's links need from the app: opening a file in a tab, as the explorer does. */
export const MarkdownLinkContext = createContext<{ openFile?: (path: string) => void }>({});

type StatKind = 'file' | 'dir' | 'symlink';

export type LocalLinkDeps = {
  stat: (path: string) => Promise<StatKind | null>;
  openFile: (path: string) => void;
  reveal: (path: string) => Promise<void>;
  notFound: (path: string) => void;
};

/** A linked file opens in lut; a linked folder shows in the system file manager; a missing path says so. */
export async function openLocalLink(path: string, deps: LocalLinkDeps): Promise<void> {
  const kind = await deps.stat(path);
  if (kind === null) deps.notFound(path);
  else if (kind === 'dir') await deps.reveal(path);
  else deps.openFile(path);
}

export function localLinkDeps(openFile: (path: string) => void): LocalLinkDeps {
  const workspace = currentWorkspaceEnv();
  return {
    stat: (path) =>
      invoke<{ kind: StatKind }>('fs_stat', { path, workspace })
        .then((stat) => stat.kind)
        .catch(() => null),
    openFile,
    reveal: async (path) => {
      if (workspace.kind !== 'local') return;
      await revealItemInDir(/^[A-Za-z]:/.test(path) ? path.replace(/\//g, '\\') : path).catch(
        (error: unknown) => console.error('[lut] failed to reveal linked folder:', error),
      );
    },
    notFound: (path) => toast.error('Linked file not found', { description: path }),
  };
}
