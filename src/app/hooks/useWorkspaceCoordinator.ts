import { DEFAULT_SPACE_ID, useNavigationStore } from '@/modules/navigation';
import { useSpacePersistence, useSpaces, useSpacesBoot } from '@/modules/spaces';
import { useWorkspaceEnvStore } from '@/modules/workspace';
import { useCallback, useEffect, useRef } from 'react';
import { useWorkspaceSwitcher } from './useWorkspaceSwitcher';

/** The navigation store's current state, for callbacks that must not close over a render's. */
const nav = () => useNavigationStore.getState();
const spaces = () => useSpaces.getState();
const spaceRoot = (id: string) => spaces().spaces.find((s) => s.id === id)?.root ?? undefined;

type WorkspaceCoordinatorArgs = {
  /** The active terminal pane's directory: a new space is rooted there. */
  activeCwd: string | null;
};

/**
 * The window's spaces and workspace (E09-04): resolves home and the launch directory, boots and persists the spaces,
 * follows the active space with the workspace environment and the active tab, and the actions that change spaces or
 * move tabs between them.
 */
export function useWorkspaceCoordinator({ activeCwd }: WorkspaceCoordinatorArgs) {
  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const setWorkspaceEnv = useWorkspaceEnvStore((s) => s.setEnv);
  const { home, launchCwd, launchCwdResolved, adoptWorkspaceEnv } = useWorkspaceSwitcher({
    setWorkspaceEnv,
  });

  const activeTabId = useNavigationStore((s) => s.activeId);
  const activeSpaceId = useSpaces((s) => s.activeId);
  const activeSpaceName = useSpaces((s) => s.spaces.find((space) => space.id === s.activeId)?.name);
  const spacesHydrated = useSpaces((s) => s.hydrated);

  useSpacesBoot({
    ready: launchCwdResolved,
    launchCwd,
    home,
    adoptWorkspaceEnv,
  });

  useSpacePersistence({
    activeSpaceId: activeSpaceId ?? DEFAULT_SPACE_ID,
    enabled: spacesHydrated,
  });

  const prevSpaceRef = useRef(activeSpaceId);
  useEffect(() => {
    if (!spacesHydrated || !activeSpaceId) return;
    const { setActiveSpaceForNewTabs, setActiveId, tabs } = nav();
    setActiveSpaceForNewTabs(activeSpaceId);
    const prev = prevSpaceRef.current;
    prevSpaceRef.current = activeSpaceId;
    if (prev === null || prev === activeSpaceId) return;
    const meta = spaces().spaces.find((s) => s.id === activeSpaceId);
    if (meta) void adoptWorkspaceEnv(meta.env);
    const inSpace = tabs.filter((t) => t.spaceId === activeSpaceId);
    if (inSpace.length === 0) return;
    // Keep the active tab if it already belongs to the newly active space (a
    // cross-space jump set it explicitly); else fall to the space's last tab.
    if (inSpace.some((t) => t.id === activeTabId)) return;
    setActiveId(inSpace[inSpace.length - 1].id);
  }, [activeSpaceId, activeTabId, spacesHydrated, adoptWorkspaceEnv]);

  const switchSpace = useCallback((id: string) => spaces().setActive(id), []);

  const cycleSpace = useCallback((delta: 1 | -1) => {
    const { spaces: list, activeId, setActive } = spaces();
    if (list.length < 2) return;
    const idx = list.findIndex((s) => s.id === activeId);
    const next = (idx + delta + list.length) % list.length;
    setActive(list[next].id);
  }, []);

  const reorderSpaces = useCallback((ids: string[]) => spaces().reorder(ids), []);

  const newSpace = useCallback(() => {
    const { spaces: list, create, setActive } = spaces();
    const meta = create({
      name: `Space ${list.length + 1}`,
      root: activeCwd ?? home ?? null,
      env: workspaceEnv,
    });
    nav().setActiveSpaceForNewTabs(meta.id);
    nav().newTab(activeCwd ?? undefined);
    setActive(meta.id);
    return meta.id;
  }, [activeCwd, home, workspaceEnv]);

  const deleteSpace = useCallback((id: string) => {
    const nextSpaceId = spaces().remove(id);
    if (!nextSpaceId) return;
    nav().removeTabsForSpace(id, nextSpaceId, spaceRoot(nextSpaceId));
  }, []);

  /** Opens a tab in a space, at its root, without leaving the active one. */
  const newTabInSpace = useCallback((spaceId: string) => {
    nav().newTabInSpace(spaceId, spaceRoot(spaceId));
  }, []);

  /** Moves a tab to another space, following it there when it was the active one and emptied its source. */
  const moveTabToSpace = useCallback((tabId: number, targetSpaceId: string) => {
    if (nav().moveTabToSpace(tabId, targetSpaceId)) spaces().setActive(targetSpaceId);
  }, []);

  /** Places a tab next to another, following it into the target's space when it was the active one and emptied its source. */
  const reorderTab = useCallback((tabId: number, targetTabId: number, edge: 'top' | 'bottom') => {
    if (!nav().reorderTab(tabId, targetTabId, edge)) return;
    const target = nav().tabs.find((x) => x.id === targetTabId);
    if (target) spaces().setActive(target.spaceId);
  }, []);

  /** Activates a tab and the space it belongs to. */
  const jumpToTab = useCallback((tabId: number) => {
    const t = nav().tabs.find((x) => x.id === tabId);
    if (!t) return;
    nav().setActiveId(tabId);
    spaces().setActive(t.spaceId);
  }, []);

  return {
    home,
    launchCwd,
    launchCwdResolved,
    workspaceEnv,
    activeSpaceId,
    activeSpaceName,
    spacesHydrated,
    switchSpace,
    cycleSpace,
    reorderSpaces,
    newSpace,
    deleteSpace,
    newTabInSpace,
    moveTabToSpace,
    reorderTab,
    jumpToTab,
  };
}
