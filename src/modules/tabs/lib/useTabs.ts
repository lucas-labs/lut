import { type NavigationState, type TerminalTab, useNavigationStore } from '@/modules/navigation';
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

const selectView = (s: NavigationState) => ({
  tabs: s.tabs,
  activeId: s.activeId,
  booted: s.booted,
});

/**
 * The window's tabs as a hook: the navigation store's state plus its actions. Actions are the
 * store's own functions, so their identity never changes.
 */
export function useTabs(initial?: Partial<TerminalTab>) {
  useState(() => useNavigationStore.getState().seedLaunchTab(initial));
  const view = useNavigationStore(useShallow(selectView));
  const s = useNavigationStore.getState();
  return {
    ...view,
    setActiveId: s.setActiveId,
    allocId: s.allocId,
    replaceTabs: s.replaceTabs,
    moveTabToSpace: s.moveTabToSpace,
    reorderTab: s.reorderTab,
    reorderTabByGap: s.reorderTabByGap,
    newTabInSpace: s.newTabInSpace,
    removeTabsForSpace: s.removeTabsForSpace,
    markBooted: s.markBooted,
    setActiveSpaceForNewTabs: s.setActiveSpaceForNewTabs,
    setOverrideLanguage: s.setOverrideLanguage,
    newTab: s.newTab,
    newAgentTab: s.newAgentTab,
    newAgentGroupTab: s.newAgentGroupTab,
    newPrivateTab: s.newPrivateTab,
    openFileTab: s.openFileTab,
    pinTab: s.pinTab,
    newPreviewTab: s.newPreviewTab,
    newMarkdownTab: s.newMarkdownTab,
    setMarkdownView: s.setMarkdownView,
    openGitDiffTab: s.openGitDiffTab,
    openCommitHistoryTab: s.openCommitHistoryTab,
    openCommitFileDiffTab: s.openCommitFileDiffTab,
    closeTab: s.closeTab,
    closeTabs: s.closeTabs,
    updateTab: s.updateTab,
    selectByIndex: s.selectByIndex,
    setLeafCwd: s.setLeafCwd,
    focusPane: s.focusPane,
    focusNextPaneInTab: s.focusNextPaneInTab,
    swapActivePaneInDirection: s.swapActivePaneInDirection,
    splitActivePane: s.splitActivePane,
    closeActivePane: s.closeActivePane,
    closePaneByLeaf: s.closePaneByLeaf,
  };
}
