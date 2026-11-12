import type { FileExplorerHandle } from '@/modules/explorer';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { setShowHidden, setTabOrientation } from '@/modules/settings/store';
import { useSidebarPanel } from '@/modules/sidebar';
import { useTabsColumn } from '@/modules/tabs';
import { useCallback, useRef } from 'react';
import { useFocusMode } from './useFocusMode';

/**
 * The window's chrome around the workspace (E09-08): the sidebar and its views, the vertical tab column, the tab
 * orientation and focus mode, with the commands that show, hide and switch them.
 */
export function useSidePanels() {
  const explorerRef = useRef<FileExplorerHandle>(null);
  const sidebar = useSidebarPanel(explorerRef);
  const { isSidebarOpen, setSidebarOpen, openSidebarView } = sidebar;
  const { focusMode, toggleFocusMode, toggleFullScreen } = useFocusMode();
  const tabOrientation = usePreferencesStore((s) => s.tabOrientation);
  const verticalTabs = tabOrientation === 'vertical';
  const tabsColumn = useTabsColumn();
  const { isTabsColumnOpen, setTabsColumnOpen } = tabsColumn;

  // The header's sidebar button: hides the sidebar and the vertical tab column together while
  // either is open, and shows both otherwise. Each keeps its own command and shortcut.
  const toggleSidePanels = useCallback(() => {
    const open = !(isSidebarOpen() || (verticalTabs && isTabsColumnOpen()));
    setSidebarOpen(open);
    if (verticalTabs) setTabsColumnOpen(open);
  }, [verticalTabs, isSidebarOpen, setSidebarOpen, isTabsColumnOpen, setTabsColumnOpen]);

  const toggleTabOrientation = useCallback(() => {
    const current = usePreferencesStore.getState().tabOrientation;
    void setTabOrientation(current === 'vertical' ? 'horizontal' : 'vertical');
  }, []);

  const toggleHiddenFiles = useCallback(() => {
    openSidebarView('explorer');
    void setShowHidden(!usePreferencesStore.getState().showHidden);
  }, [openSidebarView]);

  const openSourceControl = useCallback(() => {
    openSidebarView('source-control');
  }, [openSidebarView]);

  return {
    ...sidebar,
    ...tabsColumn,
    explorerRef,
    focusMode,
    toggleFocusMode,
    toggleFullScreen,
    verticalTabs,
    /** Whether the sidebar, or the vertical tab column, is open. */
    sidePanelsOpen: !sidebar.sidebarCollapsed || (verticalTabs && !tabsColumn.tabsColumnCollapsed),
    toggleSidePanels,
    toggleTabOrientation,
    toggleHiddenFiles,
    openSourceControl,
  };
}
