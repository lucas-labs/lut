import { createCommandItems, type PaletteInitialMode } from '@/modules/command-palette';
import type { SearchInlineHandle, SearchTarget } from '@/modules/header';
import { openSettingsWindow } from '@/modules/settings/openSettingsWindow';
import type { SidebarViewId } from '@/modules/sidebar';
import { useSpaces } from '@/modules/spaces';
import type { Tab } from '@/modules/tabs';
import { type RefObject, useCallback, useMemo, useState } from 'react';

type CommandPaletteArgs = {
  tabs: Tab[];
  activeId: number;
  activeSpaceId: string | null;
  searchTarget: SearchTarget;
  explorerRoot: string | null;
  home: string | null;
  openNewTab: () => void;
  openNewPrivateTab: () => void;
  setNewEditorOpen: (open: boolean) => void;
  openPreviewTab: (url: string) => void;
  openGitGraphFromContext: () => void;
  toggleSourceControl: () => void;
  handleCloseTabOrPane: () => void;
  splitActivePaneInActiveTab: (dir: 'row' | 'col') => void;
  moveActivePane: (target: 'new' | 1 | -1) => void;
  searchInlineRef: RefObject<SearchInlineHandle | null>;
  explorerRef: RefObject<{ focusSearch: () => void } | null>;
  toggleSidebar: () => void;
  toggleTabOrientation: () => void;
  toggleTabsColumn: () => void;
  toggleFocusMode: () => void;
  toggleFullScreen: () => void;
  toggleHiddenFiles: () => void;
  openSidebarView: (view: SidebarViewId) => void;
  newSpace: () => string;
  switchSpace: (id: string) => void;
};

/**
 * The command palette's state and its command list (E09-08), built from the window's commands only while it is open.
 */
export function useCommandPalette({
  tabs,
  activeId,
  activeSpaceId,
  searchTarget,
  explorerRoot,
  home,
  openNewTab,
  openNewPrivateTab,
  setNewEditorOpen,
  openPreviewTab,
  openGitGraphFromContext,
  toggleSourceControl,
  handleCloseTabOrPane,
  splitActivePaneInActiveTab,
  moveActivePane,
  searchInlineRef,
  explorerRef,
  toggleSidebar,
  toggleTabOrientation,
  toggleTabsColumn,
  toggleFocusMode,
  toggleFullScreen,
  toggleHiddenFiles,
  openSidebarView,
  newSpace,
  switchSpace,
}: CommandPaletteArgs) {
  const [open, setOpen] = useState(false);
  const [initialMode, setInitialMode] = useState<PaletteInitialMode>('commands');
  const openCommandPalette = useCallback((mode: PaletteInitialMode = 'commands') => {
    setInitialMode(mode);
    setOpen(true);
  }, []);

  const commandItems = useMemo(
    () =>
      open
        ? createCommandItems({
            tabs,
            activeId,
            searchTarget,
            explorerRoot,
            home,
            openNewTab,
            openNewPrivate: openNewPrivateTab,
            openNewEditor: () => setNewEditorOpen(true),
            openNewPreview: () => openPreviewTab(''),
            openGitGraph: openGitGraphFromContext,
            toggleSourceControl,
            closeActiveTabOrPane: handleCloseTabOrPane,
            splitPaneRight: () => splitActivePaneInActiveTab('row'),
            splitPaneDown: () => splitActivePaneInActiveTab('col'),
            movePaneToNewTab: () => moveActivePane('new'),
            movePaneToNextTab: () => moveActivePane(1),
            movePaneToPrevTab: () => moveActivePane(-1),
            focusSearch: () => searchInlineRef.current?.focus(),
            focusExplorerSearch: () => explorerRef.current?.focusSearch(),
            toggleSidebar,
            toggleTabOrientation,
            toggleTabsColumn,
            toggleFocusMode,
            toggleFullScreen,
            toggleHiddenFiles,
            openSettings: () => void openSettingsWindow(),
            openKeyboardShortcuts: () => void openSettingsWindow('shortcuts'),
            spaces: useSpaces.getState().spaces,
            activeSpaceId,
            openSpacesOverview: () => openSidebarView('spaces'),
            newSpace: () => void newSpace(),
            switchSpace,
          })
        : [],
    [
      open,
      tabs,
      activeId,
      searchTarget,
      explorerRoot,
      home,
      openNewTab,
      openNewPrivateTab,
      setNewEditorOpen,
      openPreviewTab,
      openGitGraphFromContext,
      toggleSourceControl,
      handleCloseTabOrPane,
      splitActivePaneInActiveTab,
      moveActivePane,
      searchInlineRef,
      explorerRef,
      toggleSidebar,
      toggleTabOrientation,
      toggleTabsColumn,
      toggleFocusMode,
      toggleFullScreen,
      toggleHiddenFiles,
      openSidebarView,
      activeSpaceId,
      newSpace,
      switchSpace,
    ],
  );

  return { open, setOpen, initialMode, openCommandPalette, commandItems };
}
