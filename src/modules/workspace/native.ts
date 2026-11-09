import { invoke } from '@tauri-apps/api/core';
import { currentWorkspaceEnv, type WorkspaceEnv } from './env';

/** Workspace and path commands shared by the app shell, Spaces and the explorer. */
export const workspaceNative = {
  workspaceCurrentDir: () => invoke<string>('workspace_current_dir'),
  workspaceAuthorize: (path: string) =>
    invoke<string>('workspace_authorize', {
      path,
      workspace: currentWorkspaceEnv(),
    }),
  canonicalize: (path: string, workspace: WorkspaceEnv = currentWorkspaceEnv()) =>
    invoke<string>('fs_canonicalize', {
      path,
      workspace,
    }),
};
