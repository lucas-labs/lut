import { nextAttentionTarget } from '@/modules/agents';
import type { PaletteInitialMode } from '@/modules/command-palette';
import type { EditorPaneHandle } from '@/modules/editor';
import { DEFAULT_SPACE_ID } from '@/modules/navigation';
import { openSettingsWindow } from '@/modules/settings/openSettingsWindow';
import {
  type ShortcutHandlers,
  type ShortcutId,
  shouldDisablePaneSwapShortcut,
  tabDigit,
  useGlobalShortcuts,
} from '@/modules/shortcuts';
import type { SidebarViewId } from '@/modules/sidebar';
import type { Tab } from '@/modules/tabs';
import { clearFocusedTerminal, isTerminalSurfaceTarget, leafIds } from '@/modules/terminal';
import type { RefObject } from 'react';

type Step = 1 | -1;

/** What the app's global shortcuts act on: the active tab and space, and the app's actions. */
export type AppShortcutArgs = {
  activeId: number;
  activeSpaceId: string | null;
  activeTab: Tab | undefined;
  editorRefs: RefObject<Map<number, EditorPaneHandle>>;
  /** Focuses the header's search. */
  focusSearchInline: () => void;
  openCommandPalette: (mode: PaletteInitialMode) => void;
  openNewTab: () => void;
  openNewPrivateTab: () => void;
  openPreviewTab: (url: string) => void;
  setNewEditorOpen: (open: boolean) => void;
  handleCloseTabOrPane: () => void;
  stepSwitcher: (delta: Step) => void;
  selectByIndex: (index: number, spaceId: string) => void;
  cycleSpace: (delta: Step) => void;
  openSidebarView: (view: SidebarViewId) => void;
  splitActivePaneInActiveTab: (dir: 'row' | 'col') => void;
  focusNextPaneInTab: (tabId: number, delta: Step) => void;
  swapActivePane: (direction: 'left' | 'right' | 'up' | 'down') => void;
  moveActivePane: (target: 'new' | Step) => void;
  toggleSourceControl: () => void;
  activateAgentTarget: (tabId: number, leafId: number) => void;
  toggleSidebar: () => void;
  toggleExplorerFocus: () => void;
  toggleHiddenFiles: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  toggleFocusMode: () => void;
  toggleFullScreen: () => void;
  toggleTabOrientation: () => void;
  toggleTabsColumn: () => void;
};

/** The app's handler for each global shortcut. */
export function createAppShortcutHandlers({
  activeId,
  activeSpaceId,
  editorRefs,
  focusSearchInline,
  openCommandPalette,
  openNewTab,
  openNewPrivateTab,
  openPreviewTab,
  setNewEditorOpen,
  handleCloseTabOrPane,
  stepSwitcher,
  selectByIndex,
  cycleSpace,
  openSidebarView,
  splitActivePaneInActiveTab,
  focusNextPaneInTab,
  swapActivePane,
  moveActivePane,
  toggleSourceControl,
  activateAgentTarget,
  toggleSidebar,
  toggleExplorerFocus,
  toggleHiddenFiles,
  zoomIn,
  zoomOut,
  zoomReset,
  toggleFocusMode,
  toggleFullScreen,
  toggleTabOrientation,
  toggleTabsColumn,
}: AppShortcutArgs): ShortcutHandlers {
  return {
    'commandPalette.open': () => openCommandPalette('commands'),
    'commandPalette.files': () => openCommandPalette('files'),
    'commandPalette.content': () => openCommandPalette('content'),
    'tab.new': openNewTab,
    'tab.newPrivate': openNewPrivateTab,
    'tab.newPreview': () => openPreviewTab(''),
    'tab.newEditor': () => setNewEditorOpen(true),
    'tab.close': handleCloseTabOrPane,
    'tab.next': () => stepSwitcher(1),
    'tab.prev': () => stepSwitcher(-1),
    'tab.selectByIndex': (e) =>
      selectByIndex((tabDigit(e, e.shiftKey) ?? 1) - 1, activeSpaceId ?? DEFAULT_SPACE_ID),
    'space.next': () => cycleSpace(1),
    'space.prev': () => cycleSpace(-1),
    'space.overview': () => openSidebarView('spaces'),
    'pane.splitRight': () => splitActivePaneInActiveTab('row'),
    'pane.splitDown': () => splitActivePaneInActiveTab('col'),
    'pane.focusNext': () => focusNextPaneInTab(activeId, 1),
    'pane.focusPrev': () => focusNextPaneInTab(activeId, -1),
    'pane.swapLeft': () => swapActivePane('left'),
    'pane.swapRight': () => swapActivePane('right'),
    'pane.swapUp': () => swapActivePane('up'),
    'pane.swapDown': () => swapActivePane('down'),
    'pane.moveToNewTab': () => moveActivePane('new'),
    'pane.moveToNextTab': () => moveActivePane(1),
    'pane.moveToPrevTab': () => moveActivePane(-1),
    'pane.source': toggleSourceControl,
    'terminal.clear': () => {
      clearFocusedTerminal();
    },
    'search.focus': () => {
      const editor = editorRefs.current.get(activeId);
      if (editor) editor.openSearch();
      else focusSearchInline();
    },
    'agent.focusAttention': () => {
      const t = nextAttentionTarget();
      if (t) activateAgentTarget(t.tabId, t.leafId);
    },
    'settings.open': () => void openSettingsWindow(),
    'sidebar.toggle': toggleSidebar,
    'explorer.focus': toggleExplorerFocus,
    'explorer.toggleHidden': toggleHiddenFiles,
    'view.zoomIn': zoomIn,
    'view.zoomOut': zoomOut,
    'view.zoomReset': zoomReset,
    'view.focusMode': toggleFocusMode,
    'view.fullScreen': toggleFullScreen,
    'view.tabOrientation': toggleTabOrientation,
    'view.tabsColumn': toggleTabsColumn,
    'editor.undo': () => editorRefs.current.get(activeId)?.undo(),
    'editor.redo': () => editorRefs.current.get(activeId)?.redo(),
    'editor.save': () => {
      void editorRefs.current.get(activeId)?.save();
    },
    'editor.codeComplete': () => editorRefs.current.get(activeId)?.triggerCodeComplete(),
  };
}

/** Whether a shortcut is off right now, so its key reaches the focused element instead. */
export function isAppShortcutDisabled(
  id: ShortcutId,
  e: KeyboardEvent,
  activeTab: Tab | undefined,
): boolean {
  const terminalPaneCount =
    activeTab?.kind === 'terminal' ? leafIds(activeTab.paneTree).length : null;
  if (shouldDisablePaneSwapShortcut(id, terminalPaneCount)) return true;
  if (
    id === 'editor.undo' ||
    id === 'editor.redo' ||
    id === 'editor.save' ||
    id === 'editor.codeComplete'
  ) {
    return activeTab?.kind !== 'editor';
  }
  if (id === 'terminal.clear') {
    // Only intercept ⌘K while a terminal is focused; elsewhere let the key
    // fall through (we never preventDefault when disabled).
    const target = (e.target as HTMLElement | null) ?? document.activeElement;
    return !isTerminalSurfaceTarget(target);
  }
  if (id === 'sidebar.toggle') {
    // Ctrl+B is also Claude Code's "run in background" key. While a terminal
    // is focused, let Ctrl+B reach the shell/Claude instead of toggling the
    // sidebar. Ctrl+Shift+B (second binding) still toggles it from anywhere.
    const target = (e.target as HTMLElement | null) ?? document.activeElement;
    const inTerminal = isTerminalSurfaceTarget(target);
    // Only defer the plain (no-shift) Ctrl/⌘+B binding; the Shift variant
    // is the always-on toggle and is never claimed by the terminal.
    return inTerminal && !e.shiftKey;
  }
  return false;
}

/**
 * Registers the app's global shortcuts (E09-01). `useGlobalShortcuts` reads the latest handlers on every key, so
 * building them on each render is enough.
 */
export function useAppShortcuts(args: AppShortcutArgs): void {
  useGlobalShortcuts(createAppShortcutHandlers(args), {
    isDisabled: (id, e) => isAppShortcutDisabled(id, e, args.activeTab),
  });
}
