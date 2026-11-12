import { isMarkdownPath } from '@/lib/utils';
import {
  DEFAULT_SPACE_ID,
  neighborTerminalTab,
  switcherOrder,
  type TabNavigatorActions,
  useNavigationStore,
} from '@/modules/navigation';
import { useSpaces } from '@/modules/spaces';
import { useTabSwitcher } from '@/modules/tabs';
import { leafIds, type PaneBounds } from '@/modules/terminal';
import { useCallback, useMemo } from 'react';
import { useAgentLaunch } from './useAgentLaunch';

/** The navigation store's current state, for callbacks that must not close over a render's. */
const nav = () => useNavigationStore.getState();

/** The panes of a terminal tab as laid out on screen, for moving the focus or a pane by direction. */
function livePaneBounds(tabId: number): PaneBounds[] {
  const tab = document.querySelector<HTMLElement>(`[data-terminal-tab="${tabId}"]`);
  if (!tab) return [];
  return [...tab.querySelectorAll<HTMLElement>('[data-pane-leaf]')].flatMap((element) => {
    const id = Number(element.dataset.paneLeaf);
    if (!Number.isFinite(id)) return [];
    const { left, right, top, bottom } = element.getBoundingClientRect();
    return [{ id, left, right, top, bottom }];
  });
}

type TabCommandsArgs = {
  activeId: number;
  activeSpaceId: string | null;
  /** The directory a new terminal tab starts in. */
  inheritedCwdForNewTab: () => string | undefined;
  /** Closes a tab, asking first when it has unsaved changes or a running program. */
  handleClose: (id: number) => void | Promise<void>;
  handleCloseTabsToRight: TabNavigatorActions['closeToEnd'];
  handleCloseOtherTabs: TabNavigatorActions['closeOthers'];
};

/**
 * The commands on tabs and panes that the shortcuts, the palette, the header and the tab navigators share (E09-08):
 * new tabs and agent groups, opening a file, splitting, moving and closing panes, the Ctrl+Tab switcher, and the
 * navigators' tab actions.
 */
export function useTabCommands({
  activeId,
  activeSpaceId,
  inheritedCwdForNewTab,
  handleClose,
  handleCloseTabsToRight,
  handleCloseOtherTabs,
}: TabCommandsArgs) {
  const openNewTab = useCallback(() => {
    nav().newTab(inheritedCwdForNewTab());
  }, [inheritedCwdForNewTab]);

  const openNewPrivateTab = useCallback(() => {
    nav().newPrivateTab(inheritedCwdForNewTab());
  }, [inheritedCwdForNewTab]);

  const launchAgentGroup = useAgentLaunch({
    inheritedCwdForNewTab,
    newAgentGroupTab: nav().newAgentGroupTab,
  });

  const openFile = useCallback((path: string, pin?: boolean) => {
    // Markdown opens in its rendered view by default; a per-tab toggle flips
    // it to the raw editor. Other files default to preview (pin=false);
    // explicit actions like context-menu "Open" pass pin=true to persist.
    if (isMarkdownPath(path)) nav().newMarkdownTab(path);
    else nav().openFileTab(path, pin ?? false);
  }, []);

  const splitActivePaneInActiveTab = useCallback(
    (dir: 'row' | 'col') => {
      const t = nav().tabs.find((x) => x.id === activeId);
      if (!t || t.kind !== 'terminal') return;
      nav().splitActivePane(activeId, dir);
    },
    [activeId],
  );

  // Moves the active tab's focused pane, session and all (E08-07).
  const moveActivePane = useCallback(
    (target: 'new' | 1 | -1) => {
      const tab = nav().tabs.find((t) => t.id === activeId);
      if (tab?.kind !== 'terminal') return;
      if (target === 'new') {
        nav().movePane(tab.activeLeafId, 'new');
        return;
      }
      const neighbor = neighborTerminalTab(nav().tabs, tab.id, target);
      if (neighbor) nav().movePane(tab.activeLeafId, neighbor.id);
    },
    [activeId],
  );

  const swapActivePane = useCallback(
    (direction: 'left' | 'right' | 'up' | 'down') => {
      nav().swapActivePaneInDirection(activeId, direction, livePaneBounds(activeId));
    },
    [activeId],
  );

  const handleCloseTabOrPane = useCallback(() => {
    const t = nav().tabs.find((x) => x.id === activeId);
    if (t?.kind === 'terminal' && leafIds(t.paneTree).length > 1) {
      nav().closeActivePane(activeId);
      return;
    }
    void handleClose(activeId);
  }, [activeId, handleClose]);

  // Focus an agent's tab, switching to its space first so the header and tab
  // strip don't end up showing a different space than the focused pane.
  const activateAgentTarget = useCallback((tabId: number, leafId: number) => {
    const space = nav().tabs.find((t) => t.id === tabId)?.spaceId;
    if (space && space !== useSpaces.getState().activeId) {
      useSpaces.getState().setActive(space);
    }
    nav().setActiveId(tabId);
    nav().focusPane(tabId, leafId);
  }, []);

  // The Ctrl+Tab quick switcher cycles by recency, not strip order.
  const getSwitcherOrder = useCallback(() => {
    const { tabs, mru } = nav();
    return switcherOrder(tabs, mru, activeId, activeSpaceId ?? DEFAULT_SPACE_ID);
  }, [activeId, activeSpaceId]);

  const { state: switcherState, step: stepSwitcher } = useTabSwitcher({
    getOrder: getSwitcherOrder,
    onCommit: (id) => {
      if (nav().tabs.some((t) => t.id === id)) nav().setActiveId(id);
    },
  });

  const tabActions = useMemo<TabNavigatorActions>(
    () => ({
      select: nav().setActiveId,
      close: handleClose,
      closeToEnd: handleCloseTabsToRight,
      closeOthers: handleCloseOtherTabs,
      pin: nav().pinTab,
      rename: (id: number, title: string) => nav().updateTab(id, { customTitle: title.trim() }),
      reorder: nav().reorderTabByGap,
    }),
    [handleClose, handleCloseTabsToRight, handleCloseOtherTabs],
  );

  return {
    openNewTab,
    openNewPrivateTab,
    launchAgentGroup,
    openFile,
    splitActivePaneInActiveTab,
    moveActivePane,
    swapActivePane,
    handleCloseTabOrPane,
    activateAgentTarget,
    switcherState,
    stepSwitcher,
    tabActions,
  };
}
