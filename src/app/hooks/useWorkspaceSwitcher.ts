import {
  getWslHome,
  LOCAL_WORKSPACE,
  type WorkspaceEnv,
  workspaceNative,
} from '@/modules/workspace';
import { homeDir } from '@tauri-apps/api/path';
import { useCallback, useEffect, useState } from 'react';

async function resolveEnvHome(env: WorkspaceEnv): Promise<string> {
  return env.kind === 'wsl' ? getWslHome(env.distro) : (await homeDir()).replace(/\\/g, '/');
}

type Params = {
  setWorkspaceEnv: (env: WorkspaceEnv) => void;
};

/**
 * Owns the resolved home / launch cwd. adoptWorkspaceEnv applies a space's env + home on
 * restore, without teardown.
 */
export function useWorkspaceSwitcher({ setWorkspaceEnv }: Params) {
  const [home, setHome] = useState<string | null>(null);
  const [launchCwd, setLaunchCwd] = useState<string | null>(null);
  const [launchCwdResolved, setLaunchCwdResolved] = useState(false);

  useEffect(() => {
    homeDir()
      .then(async (p) => {
        const normalized = p.replace(/\\/g, '/');
        setHome(normalized);
        try {
          await workspaceNative.workspaceAuthorize(normalized);
        } catch {
          // Bootstrap already authorizes home from Rust; ignore.
        }
      })
      .catch(() => setHome(null));
  }, []);

  useEffect(() => {
    workspaceNative
      .workspaceCurrentDir()
      .then(setLaunchCwd)
      .catch(() => setLaunchCwd(null))
      .finally(() => setLaunchCwdResolved(true));
  }, []);

  const authorizeHome = useCallback(async (nextHome: string) => {
    setHome(nextHome);
    setLaunchCwd(nextHome);
    try {
      await workspaceNative.workspaceAuthorize(nextHome);
    } catch {
      // Non-fatal — git panel will surface "not authorized" if needed.
    }
  }, []);

  const adoptWorkspaceEnv = useCallback(
    async (env: WorkspaceEnv): Promise<string | null> => {
      setWorkspaceEnv(env.kind === 'local' ? LOCAL_WORKSPACE : env);
      let nextHome: string;
      try {
        nextHome = await resolveEnvHome(env);
      } catch {
        return null;
      }
      await authorizeHome(nextHome);
      return nextHome;
    },
    [setWorkspaceEnv, authorizeHome],
  );

  return {
    home,
    launchCwd,
    launchCwdResolved,
    adoptWorkspaceEnv,
  };
}
