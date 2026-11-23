import { DEFAULT_SPACE_ID, useNavigationStore } from '@/modules/navigation';
import { getLaunchArgDir } from '@/modules/platform';
import { usePreferencesStore } from '@/modules/settings/preferences';
import type { Tab } from '@/modules/tabs';
import { isLeaf, type PaneNode } from '@/modules/terminal/lib/panes';
import { parseWorkspaceScopeKey, type WorkspaceEnv, workspaceNative } from '@/modules/workspace';
import { useEffect, useRef } from 'react';
import { activeSpaceEnv, freshTabCwd } from './activeSpace';
import { EPHEMERAL_SPACE_ID, ephemeralSpaceMeta, ephemeralTabCwd } from './ephemeral';
import { reportSpacesLoad } from './loadNotice';
import { freshTerminalTab, hydrateTabs } from './serialize';
import { loadAll, saveActiveId, saveSpacesList, type SpaceMeta, type SpaceState } from './store';
import { useSpaces } from './useSpaces';

type Params = {
  ready: boolean;
  launchCwd: string | null;
  home: string | null;
  adoptWorkspaceEnv: (env: WorkspaceEnv) => Promise<string | null>;
};

function uniqueCwds(tabs: Tab[]): string[] {
  const set = new Set<string>();
  const walk = (n: PaneNode) => {
    if (isLeaf(n)) {
      if (n.cwd) set.add(n.cwd);
      return;
    }
    for (const c of n.children) walk(c);
  };
  for (const t of tabs) if (t.kind === 'terminal') walk(t.paneTree);
  return [...set];
}

function restoreTabs(
  spaces: SpaceMeta[],
  states: Map<string, SpaceState>,
  allocId: () => number,
): Tab[] {
  return spaces.flatMap((space) => {
    const st = states.get(space.id);
    return st ? hydrateTabs(st.tabs, space.id, allocId) : [];
  });
}

async function authorizeCwds(tabs: Tab[]): Promise<void> {
  await Promise.allSettled(uniqueCwds(tabs).map((cwd) => workspaceNative.workspaceAuthorize(cwd)));
}

/** Each saved Space's active tab index, so saving keeps it for Spaces not opened this session. */
function activeIndexes(states: Map<string, SpaceState>): Record<string, number> {
  const indexes: Record<string, number> = {};
  for (const [id, st] of states) indexes[id] = st.activeTabIndex;
  return indexes;
}

/**
 * Restores the saved spaces and their tabs. With the ephemeral Space on (E16-15), it is created first and active, with
 * one terminal; else the default space is created on first run or when the saved file was unusable. What could not be
 * restored is reported. Other failures are logged: the app still starts, with the launch tab.
 */
export async function bootSpaces({
  launchCwd,
  home,
  adoptWorkspaceEnv,
}: Omit<Params, 'ready'>): Promise<void> {
  const { allocId, replaceTabs, setActiveSpaceForNewTabs } = useNavigationStore.getState();
  try {
    const load = await loadAll();
    reportSpacesLoad(load);
    const { spaces: saved, activeId, states } = load.data;
    // Hydrate prefs before reading the ephemeral Space and the saved workspace env.
    await usePreferencesStore
      .getState()
      .init()
      .catch(() => {});
    const prefs = usePreferencesStore.getState();

    if (prefs.ephemeralSpace.enabled) {
      const cwd = ephemeralTabCwd(getLaunchArgDir() ?? null, prefs.ephemeralSpace.folder);
      const env = parseWorkspaceScopeKey(prefs.defaultWorkspaceEnv);
      const meta = ephemeralSpaceMeta(prefs.ephemeralSpace, env, cwd);
      const spaces = [meta, ...saved];
      setActiveSpaceForNewTabs(EPHEMERAL_SPACE_ID);
      await adoptWorkspaceEnv(env);
      const tab = freshTerminalTab(EPHEMERAL_SPACE_ID, cwd, allocId);
      const restored = [tab, ...restoreTabs(saved, states, allocId)];
      await authorizeCwds(restored);
      useSpaces.getState().hydrate(spaces, EPHEMERAL_SPACE_ID, activeIndexes(states));
      replaceTabs(restored, tab.id);
      return;
    }

    const spaces = saved;
    if (spaces.length === 0) {
      const root = launchCwd ?? home ?? null;
      const meta: SpaceMeta = {
        id: DEFAULT_SPACE_ID,
        name: 'Default',
        root,
        env: parseWorkspaceScopeKey(prefs.defaultWorkspaceEnv),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveSpacesList([meta]);
      await saveActiveId(DEFAULT_SPACE_ID);
      setActiveSpaceForNewTabs(DEFAULT_SPACE_ID);
      useSpaces.getState().hydrate([meta], DEFAULT_SPACE_ID);
      return;
    }

    const restored = restoreTabs(spaces, states, allocId);

    const active = activeId && spaces.some((s) => s.id === activeId) ? activeId : spaces[0].id;
    setActiveSpaceForNewTabs(active);

    // Apply the space's env+home before the fresh-tab fallback and spawns
    // below; env is set synchronously so cwd resolution picks WSL vs local.
    const env = activeSpaceEnv(spaces, active);
    const restoredHome = await adoptWorkspaceEnv(env);

    // Active space must never be empty, else its tab list shows nothing.
    if (!restored.some((t) => t.spaceId === active)) {
      const cwd = freshTabCwd(env, restoredHome, launchCwd, home);
      restored.push(freshTerminalTab(active, cwd, allocId));
    }

    await authorizeCwds(restored);
    useSpaces.getState().hydrate(spaces, active, activeIndexes(states));

    const inActive = restored.filter((t) => t.spaceId === active);
    const idx = states.get(active)?.activeTabIndex ?? 0;
    const activeTab = inActive[idx] ?? inActive[0] ?? restored[0];
    replaceTabs(restored, activeTab.id);
  } catch (e) {
    console.error('[lut] spaces boot failed:', e);
  }
}

export function useSpacesBoot({ ready, launchCwd, home, adoptWorkspaceEnv }: Params) {
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    void bootSpaces({ launchCwd, home, adoptWorkspaceEnv }).finally(() =>
      useNavigationStore.getState().markBooted(),
    );
  }, [ready, launchCwd, home, adoptWorkspaceEnv]);
}
