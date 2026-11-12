import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { consumeLaunchFiles, getLaunchDir } from '@/lib/launchDir';
import { IS_MAC } from '@/lib/platform';
import { quoteShellArg } from '@/lib/shellQuote';
import { useZoom } from '@/lib/useZoom';
import { isMarkdownPath } from '@/lib/utils';
import {
  type AgentLaunchRequest,
  AgentNotificationsBridge,
  findAgentLauncher,
  nextAttentionTarget,
  validateAgentLaunchCommand,
} from '@/modules/agents';
import {
  CommandPalette,
  createCommandItems,
  type OpenFileTarget,
  type PaletteInitialMode,
} from '@/modules/command-palette';
import { useControlBridge } from '@/modules/control';
import { type EditorPaneHandle, NewEditorDialog, useApplyEditorFontSize, useEditorFileSync } from '@/modules/editor';
import { FileExplorer, type FileExplorerHandle } from '@/modules/explorer';
import type { GitHistorySearchHandle } from '@/modules/git-history';
import { type SearchInlineHandle, type SearchTarget, TitleBar } from '@/modules/header';
import { setLspNavigator } from '@/modules/lsp';
import {
  DEFAULT_SPACE_ID,
  neighborTerminalTab,
  switcherOrder,
  type TabNavigatorActions,
  useNavigationStore,
  useNavigatorItems,
} from '@/modules/navigation';
import type { PreviewPaneHandle } from '@/modules/preview';
import { openSettingsWindow } from '@/modules/settings/openSettingsWindow';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { setShowHidden, setTabOrientation } from '@/modules/settings/store';
import {
  type ShortcutHandlers,
  type ShortcutId,
  shouldDisablePaneSwapShortcut,
  tabDigit,
  useGlobalShortcuts,
} from '@/modules/shortcuts';
import { SidebarRail, useSidebarPanel } from '@/modules/sidebar';
import { SourceControlPanel, useRepositoryTargeting, useSourceControlContext } from '@/modules/source-control';
import { SpacesView, useSpacePersistence, useSpaces, useSpacesBoot } from '@/modules/spaces';
import {
  type CloseTabsPlan,
  TabNavigator,
  TabSwitcher,
  useTabs,
  useTabsColumn,
  useTabSwitcher,
  useWindowTitle,
  useWorkspaceCwd,
} from '@/modules/tabs';
import {
  clearFocusedTerminal,
  findLeafCwd,
  hasLeaf,
  isTerminalSurfaceTarget,
  leafIds,
  type PaneBounds,
  ptyIdForLeaf,
  type TerminalPaneHandle,
  useAgentActivityStore,
  useTerminalFileDrop,
  whenSessionReady,
  writeToSession,
} from '@/modules/terminal';
import { bindTerminalWindowFocus } from '@/modules/terminal/ghostty/renderScheduling';
import { subscribeWindowPresentation } from '@/modules/terminal/ghostty/windowPresentation';
import type { TerminalSearchController } from '@/modules/terminal/search/TerminalSearchController';
import {
  LivePageResizeBridge,
  ThemeProvider,
  useThemeFileEditing,
  WindowActivityBridge,
  WindowVibrancyBridge,
} from '@/modules/theme';
import { useWorkspaceEnvStore, workspaceNative, workspaceScopeKey } from '@/modules/workspace';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppShell } from './AppShell';
import { CloseDialogs } from './components/CloseDialogs';
import { WorkspaceSurface } from './components/WorkspaceSurface';
import { hasOpenPathTab, renamedPath, spacesEmptiedByTabs } from './hooks/tabCloseGuards';
import { useAppCloseGuard } from './hooks/useAppCloseGuard';
import { useFocusMode } from './hooks/useFocusMode';
import { useTabCloseGuards } from './hooks/useTabCloseGuards';
import { useWorkspaceSwitcher } from './hooks/useWorkspaceSwitcher';
import { registerTabPresenters } from './tabPresenters';

registerTabPresenters();

/** The navigation store's current state, for callbacks that must not close over a render's. */
const nav = () => useNavigationStore.getState();

// Real-application benchmark driver (scripts/app-lab). `__LUT_BENCH__` is the literal `false`
// in a normal build, so this is `null` and neither the import nor its chunk is emitted.
const BenchBridge = __LUT_BENCH__ ? lazy(() => import('@/bench/BenchBridge')) : null;

export default function App() {
  const {
    tabs,
    activeId,
    setActiveId,
    booted,
    moveTabToSpace,
    reorderTab,
    reorderTabByGap,
    newTabInSpace,
    removeTabsForSpace,
    setActiveSpaceForNewTabs,
    newTab,
    newAgentGroupTab,
    newPrivateTab,
    openFileTab,
    pinTab,
    newPreviewTab,
    newMarkdownTab,
    setMarkdownView,
    openGitDiffTab,
    openCommitHistoryTab,
    openCommitFileDiffTab,
    closeTab,
    closeTabs,
    updateTab,
    selectByIndex,
    setLeafCwd,
    focusPane,
    focusNextPaneInTab,
    swapActivePaneInDirection,
    splitActivePane,
    setSplitRatios,
    movePane,
    closeActivePane,
    closePaneByLeaf,
  } = useTabs(getLaunchDir() ? { cwd: getLaunchDir() } : undefined);

  // Load the saved preferences into this window and follow changes made in
  // Settings. Spaces boot only does it on a first launch with no saved spaces.
  const initPreferences = usePreferencesStore((s) => s.init);
  useEffect(() => {
    void initPreferences();
  }, [initPreferences]);

  const activeTerminalTab = useMemo(() => {
    const t = tabs.find((x) => x.id === activeId);
    return t && t.kind === 'terminal' ? t : null;
  }, [tabs, activeId]);
  const activeLeafId = activeTerminalTab?.activeLeafId ?? null;

  const searchAddons = useRef<Map<number, TerminalSearchController>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] = useState<TerminalSearchController | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const terminalRefs = useRef<Map<number, TerminalPaneHandle>>(new Map());
  const editorRefs = useRef<Map<number, EditorPaneHandle>>(new Map());
  const previewRefs = useRef<Map<number, PreviewPaneHandle>>(new Map());
  // A new empty preview tab wants its address bar focused; the preview code may still be loading (E07-04).
  const pendingPreviewFocusRef = useRef<number | null>(null);
  const [activeEditorHandle, setActiveEditorHandle] = useState<EditorPaneHandle | null>(null);
  const [gitHistoryHandle, setGitHistoryHandle] = useState<GitHistorySearchHandle | null>(null);
  const { zoomIn, zoomOut, zoomReset } = useZoom();
  useApplyEditorFontSize();
  const terminalPathDropTarget = useTerminalFileDrop();
  const explorerRef = useRef<FileExplorerHandle>(null);

  const workspaceEnv = useWorkspaceEnvStore((s) => s.env);
  const setWorkspaceEnv = useWorkspaceEnvStore((s) => s.setEnv);
  const { home, launchCwd, launchCwdResolved, adoptWorkspaceEnv } = useWorkspaceSwitcher({ setWorkspaceEnv });

  const activeSpaceId = useSpaces((s) => s.activeId);
  const activeSpaceName = useSpaces((s) => s.spaces.find((space) => space.id === s.activeId)?.name);
  const spacesHydrated = useSpaces((s) => s.hydrated);
  const sourceControlSpaceId = activeSpaceId ?? DEFAULT_SPACE_ID;

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
    setActiveSpaceForNewTabs(activeSpaceId);
    const prev = prevSpaceRef.current;
    prevSpaceRef.current = activeSpaceId;
    if (prev === null || prev === activeSpaceId) return;
    const meta = useSpaces.getState().spaces.find((s) => s.id === activeSpaceId);
    if (meta) void adoptWorkspaceEnv(meta.env);
    const inSpace = nav().tabs.filter((t) => t.spaceId === activeSpaceId);
    if (inSpace.length === 0) return;
    // Keep the active tab if it already belongs to the newly active space (a
    // cross-space jump set it explicitly); else fall to the space's last tab.
    if (inSpace.some((t) => t.id === activeId)) return;
    setActiveId(inSpace[inSpace.length - 1].id);
  }, [activeSpaceId, activeId, spacesHydrated, setActiveSpaceForNewTabs, setActiveId, adoptWorkspaceEnv]);

  const {
    sidebarRef,
    sidebarWidthRef,
    sidebarView,
    sidebarCollapsed,
    persistSidebarView,
    persistSidebarCollapsed,
    toggleSidebar,
    isSidebarOpen,
    setSidebarOpen,
    cycleSidebarView,
    openSidebarView,
    persistSidebarWidth,
    toggleExplorerFocus,
  } = useSidebarPanel(explorerRef);

  const [newEditorOpen, setNewEditorOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteInitialMode, setPaletteInitialMode] = useState<PaletteInitialMode>('commands');
  const openCommandPalette = useCallback((mode: PaletteInitialMode = 'commands') => {
    setPaletteInitialMode(mode);
    setCommandPaletteOpen(true);
  }, []);
  const activeTab = tabs.find((t) => t.id === activeId);
  const isTerminalTab = activeTab?.kind === 'terminal';
  const isEditorTab = activeTab?.kind === 'editor';
  const isGitHistoryTab = activeTab?.kind === 'git-history';

  useEditorFileSync({ tabs, editorRefs });
  useThemeFileEditing({ openFileTab });

  const { explorerRoot, inheritedCwdForNewTab } = useWorkspaceCwd(activeTab, tabs, launchCwd ?? home);

  useWindowTitle(activeTab, explorerRoot);

  useEffect(() => {
    setActiveSearchAddon(activeLeafId !== null ? (searchAddons.current.get(activeLeafId) ?? null) : null);
    setActiveEditorHandle(editorRefs.current.get(activeId) ?? null);
  }, [activeId, activeLeafId]);

  const handleSearchReady = useCallback(
    (leafId: number, addon: TerminalSearchController) => {
      searchAddons.current.set(leafId, addon);
      if (leafId === activeLeafId) setActiveSearchAddon(addon);
    },
    [activeLeafId],
  );

  const disposeTab = useCallback(
    (id: number) => {
      // Terminal-leaf-keyed maps (terminalRefs/searchAddons) are pruned by
      // the effect below as the pane tree changes; only the tab-id-keyed
      // handles need explicit cleanup here.
      editorRefs.current.delete(id);
      previewRefs.current.delete(id);
      closeTab(id);
    },
    [closeTab],
  );

  const disposeTabs = useCallback(
    (anchorId: number, plan: CloseTabsPlan) => {
      const closedIds = closeTabs(anchorId, plan);
      for (const id of closedIds) {
        editorRefs.current.delete(id);
        previewRefs.current.delete(id);
      }
    },
    [closeTabs],
  );

  const disposeDeletedTabs = useCallback(
    (ids: number[]) => {
      if (ids.length === 0) return;
      for (const spaceId of spacesEmptiedByTabs(nav().tabs, ids)) {
        const root = useSpaces.getState().spaces.find((s) => s.id === spaceId)?.root;
        newTabInSpace(spaceId, root ?? undefined);
      }
      for (const id of ids) disposeTab(id);
    },
    [disposeTab, newTabInSpace],
  );

  const {
    pendingCloseTab,
    pendingTerminalCloseTab,
    pendingDeleteTabs,
    pendingCloseMany,
    closeManyConfirming,
    handleClose,
    handleCloseTabsToRight,
    handleCloseOtherTabs,
    confirmClose,
    cancelClose,
    confirmTerminalClose,
    cancelTerminalClose,
    confirmDeleteClose,
    cancelDeleteClose,
    confirmCloseMany,
    cancelCloseMany,
    handlePathsDeleted,
  } = useTabCloseGuards({
    tabs,
    activeId,
    disposeTab,
    disposeDeletedTabs,
    disposeTabs,
  });

  const { pendingAppClose, confirmAppClose, cancelAppClose } = useAppCloseGuard();

  useEffect(() => {
    const live = new Set<number>();
    for (const t of tabs) {
      if (t.kind === 'terminal') {
        for (const id of leafIds(t.paneTree)) live.add(id);
      }
    }
    for (const k of [...terminalRefs.current.keys()]) if (!live.has(k)) terminalRefs.current.delete(k);
    for (const k of [...searchAddons.current.keys()]) if (!live.has(k)) searchAddons.current.delete(k);
  }, [tabs]);

  useEffect(() => {
    const tab = nav().tabs.find((t) => t.id === activeId);
    if (tab?.kind !== 'terminal') return;
    const ptyIds = leafIds(tab.paneTree).flatMap((leafId) => {
      const ptyId = ptyIdForLeaf(leafId);
      return ptyId === null ? [] : [ptyId];
    });
    useAgentActivityStore.getState().acknowledgeAttention(ptyIds);
  }, [activeId]);

  // The Ctrl+Tab quick switcher cycles by recency, not strip order.
  const getSwitcherOrder = useCallback(() => {
    const { tabs, mru } = nav();
    return switcherOrder(tabs, mru, activeId, activeSpaceId ?? DEFAULT_SPACE_ID);
  }, [activeId, activeSpaceId]);

  const { state: switcherState, step: stepSwitcher } = useTabSwitcher({
    getOrder: getSwitcherOrder,
    onCommit: (id) => {
      if (nav().tabs.some((t) => t.id === id)) setActiveId(id);
    },
  });

  const cycleSpace = useCallback((delta: 1 | -1) => {
    const { spaces, activeId: sid, setActive } = useSpaces.getState();
    if (spaces.length < 2) return;
    const idx = spaces.findIndex((s) => s.id === sid);
    const next = (idx + delta + spaces.length) % spaces.length;
    setActive(spaces[next].id);
  }, []);

  const captureActiveSelection = useCallback((): string | null => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t) return null;
    if (t.kind === 'terminal') {
      const lid = t.activeLeafId;
      return terminalRefs.current.get(lid)?.getSelection() ?? null;
    }
    if (t.kind === 'editor') {
      return editorRefs.current.get(activeId)?.getSelection() ?? null;
    }
    return null;
  }, [tabs, activeId]);

  const openNewTab = useCallback(() => {
    newTab(inheritedCwdForNewTab());
  }, [newTab, inheritedCwdForNewTab]);

  const openNewPrivateTab = useCallback(() => {
    newPrivateTab(inheritedCwdForNewTab());
  }, [newPrivateTab, inheritedCwdForNewTab]);

  const launchAgentGroup = useCallback(
    (request: AgentLaunchRequest) => {
      const command = validateAgentLaunchCommand(request.command);
      if (!command.ok) return;
      const launcher = findAgentLauncher(request.agent);
      const title = request.instances === 1 ? launcher.label : `${launcher.label} × ${request.instances}`;
      const { leafIds: agentLeafIds } = newAgentGroupTab(inheritedCwdForNewTab(), title, request.instances);
      const hooksReady = launcher.supportsHooks
        ? invoke('agent_enable_hooks', {
            agent: request.agent,
          }).catch((error) => {
            console.warn(`[lut] could not enable ${request.agent} notifications:`, error);
          })
        : Promise.resolve();

      for (const leafId of agentLeafIds) {
        void (async () => {
          await Promise.all([whenSessionReady(leafId), hooksReady]);
          if (!writeToSession(leafId, `${command.command}\r`)) {
            console.error(`[lut] agent terminal ${leafId} closed before launch`);
          }
        })();
      }
    },
    [inheritedCwdForNewTab, newAgentGroupTab],
  );

  const sendCd = useCallback(
    (path: string) => {
      if (activeLeafId === null) return;
      const term = terminalRefs.current.get(activeLeafId);
      if (!term) return;
      void term.writeAtPrompt(`cd ${quoteShellArg(path)}\r`).then((typed) => {
        if (typed) {
          term.focus();
          return;
        }
        toast('Terminal is busy', {
          description: 'Open a new tab to go there, or exit the running program.',
        });
      });
    },
    [activeLeafId],
  );

  const cdInNewTab = useCallback(
    (path: string) => {
      const tabId = newTab(path);
      setTimeout(() => {
        const tab = nav().tabs.find((x) => x.id === tabId);
        if (!tab || tab.kind !== 'terminal') return;
        const t = terminalRefs.current.get(tab.activeLeafId);
        if (!t) return;
        t.write(`cd ${quoteShellArg(path)}\r`);
        t.focus();
      }, 80);
    },
    [newTab],
  );

  const handleOpenFile = useCallback(
    (path: string, pin?: boolean) => {
      // Markdown opens in its rendered view by default; a per-tab toggle flips
      // it to the raw editor. Other files default to preview (pin=false);
      // explicit actions like context-menu "Open" pass pin=true to persist.
      if (isMarkdownPath(path)) newMarkdownTab(path);
      else openFileTab(path, pin ?? false);
    },
    [openFileTab, newMarkdownTab],
  );

  const openLaunchFiles = useCallback(
    (paths: string[]) => {
      for (const path of paths) handleOpenFile(path, true);
    },
    [handleOpenFile],
  );

  // Warm start: the backend emits once the window already exists. Attach on
  // mount so an "Open With" that lands mid-restore isn't dropped — the backend
  // also seeds the drain-once state, so the boot drain below is the safety net.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    (async () => {
      const off = await listen<string[]>('lut:open-file', (e) => {
        openLaunchFiles(e.payload);
      });
      if (disposed) off();
      else unlisten = off;
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [openLaunchFiles]);

  // Cold start: files arrive as CLI args (Linux/Windows) or the macOS open-files
  // event, and get_launch_files drains them once. Wait for `booted` — the spaces
  // restore ends in replaceTabs(), which overwrites the whole tab list and would
  // discard a launch tab opened before it, making the file flash open and vanish.
  // Booting first also lands the tab in the restored active space, and lets
  // openFileTab dedupe against a session that already had the file open.
  useEffect(() => {
    if (!booted) return;
    void (async () => {
      openLaunchFiles(await consumeLaunchFiles());
    })();
  }, [booted, openLaunchFiles]);

  const handleExplorerPathRenamed = useCallback(
    (from: string, to: string) => {
      for (const tab of nav().tabs) {
        if (tab.kind !== 'editor' && tab.kind !== 'markdown') continue;
        const path = renamedPath(tab.path, from, to);
        if (path === null) continue;
        const i = path.lastIndexOf('/');
        updateTab(tab.id, {
          path,
          title: i === -1 ? path : path.slice(i + 1),
        });
      }
    },
    [updateTab],
  );

  const canReplaceExplorerPath = useCallback((path: string) => !hasOpenPathTab(nav().tabs, path), []);

  const activeTerminalLeafCwd =
    activeTab?.kind === 'terminal'
      ? (findLeafCwd(activeTab.paneTree, activeTab.activeLeafId) ?? activeTab.cwd ?? null)
      : null;

  const activeFilePath = (() => {
    if (activeTab?.kind === 'editor') return activeTab.path;
    if (activeTab?.kind === 'git-diff') {
      if (/^([A-Za-z]:|\/|\\)/.test(activeTab.path)) return activeTab.path;
      const root = activeTab.repoRoot.replace(/[\\/]+$/, '');
      const rel = activeTab.path.replace(/^[\\/]+/, '');
      return `${root}/${rel}`;
    }
    if (activeTab?.kind === 'git-commit-file') {
      const root = activeTab.repoRoot.replace(/[\\/]+$/, '');
      const rel = activeTab.path.replace(/^[\\/]+/, '');
      return `${root}/${rel}`;
    }
    return null;
  })();
  const explorerActiveFilePath = activeTab?.kind === 'editor' || activeTab?.kind === 'markdown' ? activeTab.path : null;
  const isRepositoryContextCurrent = useCallback((spaceId: string, workspaceKey: string) => {
    const currentSpaceId = useSpaces.getState().activeId ?? DEFAULT_SPACE_ID;
    const currentWorkspaceKey = workspaceScopeKey(useWorkspaceEnvStore.getState().env);
    return spaceId === currentSpaceId && workspaceKey === currentWorkspaceKey;
  }, []);
  const openSourceControl = useCallback(() => {
    openSidebarView('source-control');
  }, [openSidebarView]);
  const toggleHiddenFiles = useCallback(() => {
    openSidebarView('explorer');
    void setShowHidden(!usePreferencesStore.getState().showHidden);
  }, [openSidebarView]);
  const {
    repositoryTarget: sourceControlRepositoryTarget,
    openInSourceControl: handleOpenRepositoryInSourceControl,
    openGitHistory: handleOpenGitHistoryForPath,
    followActiveContext: handleFollowRepositoryContext,
  } = useRepositoryTargeting({
    spaceId: sourceControlSpaceId,
    workspaceKey: workspaceScopeKey(workspaceEnv),
    isContextCurrent: isRepositoryContextCurrent,
    openSourceControl,
    openCommitHistoryTab,
  });
  const explorerGitDecorations = usePreferencesStore((s) => s.explorerGitDecorations);
  const { sourceControl, toggleSourceControl, openGitGraphFromContext } = useSourceControlContext({
    activeTab,
    tabs,
    activeTerminalLeafCwd,
    explorerRoot,
    launchCwd,
    launchCwdResolved,
    home,
    sidebarView,
    sidebarCollapsed,
    explorerGitDecorations,
    repositoryTarget: sourceControlRepositoryTarget,
    cycleSidebarView,
    openCommitHistoryTab,
  });

  /** Focuses a pending preview's address bar once its pane exists, if its tab is still active. */
  const focusPendingPreview = useCallback((id: number) => {
    if (pendingPreviewFocusRef.current !== id) return;
    const handle = previewRefs.current.get(id);
    if (!handle) return; // still loading: registerPreviewHandle calls this again
    pendingPreviewFocusRef.current = null;
    if (nav().activeId === id) handle.focusAddressBar();
  }, []);

  const openPreviewTab = useCallback(
    (url: string) => {
      const id = newPreviewTab(url);
      // Focus the address bar if the URL is empty so the user can type. If the pane is not registered yet, the
      // request waits for registerPreviewHandle.
      if (!url) {
        pendingPreviewFocusRef.current = id;
        setTimeout(() => focusPendingPreview(id), 0);
      }
      return id;
    },
    [newPreviewTab, focusPendingPreview],
  );

  const splitActivePaneInActiveTab = useCallback(
    (dir: 'row' | 'col') => {
      const t = nav().tabs.find((x) => x.id === activeId);
      if (!t || t.kind !== 'terminal') return;
      splitActivePane(activeId, dir);
    },
    [activeId, splitActivePane],
  );

  // Moves the active tab's focused pane, session and all (E08-07).
  const moveActivePane = useCallback(
    (target: 'new' | 1 | -1) => {
      const tab = nav().tabs.find((t) => t.id === activeId);
      if (tab?.kind !== 'terminal') return;
      if (target === 'new') {
        movePane(tab.activeLeafId, 'new');
        return;
      }
      const neighbor = neighborTerminalTab(nav().tabs, tab.id, target);
      if (neighbor) movePane(tab.activeLeafId, neighbor.id);
    },
    [activeId, movePane],
  );

  const livePaneBounds = useCallback((tabId: number): PaneBounds[] => {
    const tab = document.querySelector<HTMLElement>(`[data-terminal-tab="${tabId}"]`);
    if (!tab) return [];
    return [...tab.querySelectorAll<HTMLElement>('[data-pane-leaf]')].flatMap((element) => {
      const id = Number(element.dataset.paneLeaf);
      if (!Number.isFinite(id)) return [];
      const { left, right, top, bottom } = element.getBoundingClientRect();
      return [{ id, left, right, top, bottom }];
    });
  }, []);

  const swapActivePane = useCallback(
    (direction: 'left' | 'right' | 'up' | 'down') => {
      swapActivePaneInDirection(activeId, direction, livePaneBounds(activeId));
    },
    [activeId, livePaneBounds, swapActivePaneInDirection],
  );

  const handleCloseTabOrPane = useCallback(() => {
    const t = nav().tabs.find((x) => x.id === activeId);
    if (t?.kind === 'terminal' && leafIds(t.paneTree).length > 1) {
      closeActivePane(activeId);
      return;
    }
    void handleClose(activeId);
  }, [activeId, closeActivePane, handleClose]);

  const { focusMode, toggleFocusMode, toggleFullScreen } = useFocusMode();
  const tabOrientation = usePreferencesStore((s) => s.tabOrientation);
  const verticalTabs = tabOrientation === 'vertical';
  const {
    tabsColumnRef,
    tabsColumnInitialWidth,
    tabsColumnCollapsed,
    persistTabsColumnLayout,
    toggleTabsColumn,
    isTabsColumnOpen,
    setTabsColumnOpen,
  } = useTabsColumn();
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

  // Focus an agent's tab, switching to its space first so the header and tab
  // strip don't end up showing a different space than the focused pane.
  const activateAgentTarget = useCallback(
    (tabId: number, leafId: number) => {
      const space = nav().tabs.find((t) => t.id === tabId)?.spaceId;
      if (space && space !== useSpaces.getState().activeId) {
        useSpaces.getState().setActive(space);
      }
      setActiveId(tabId);
      focusPane(tabId, leafId);
    },
    [setActiveId, focusPane],
  );

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
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
      'tab.selectByIndex': (e) => selectByIndex((tabDigit(e, e.shiftKey) ?? 1) - 1, activeSpaceId ?? DEFAULT_SPACE_ID),
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
        else searchInlineRef.current?.focus();
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
    }),
    [
      activeId,
      moveActivePane,
      openCommandPalette,
      stepSwitcher,
      cycleSpace,
      handleCloseTabOrPane,
      openNewTab,
      openNewPrivateTab,
      openPreviewTab,
      activeSpaceId,
      selectByIndex,
      splitActivePaneInActiveTab,
      focusNextPaneInTab,
      swapActivePane,
      toggleSourceControl,
      toggleSidebar,
      toggleExplorerFocus,
      toggleHiddenFiles,
      zoomIn,
      zoomOut,
      zoomReset,
      activateAgentTarget,
      toggleTabOrientation,
      toggleTabsColumn,
      openSidebarView,
      toggleFocusMode,
      toggleFullScreen,
    ],
  );

  const shortcutsDisabled = useCallback(
    (id: ShortcutId, e: KeyboardEvent) => {
      const terminalPaneCount = activeTab?.kind === 'terminal' ? leafIds(activeTab.paneTree).length : null;
      if (shouldDisablePaneSwapShortcut(id, terminalPaneCount)) return true;
      if (id === 'editor.undo' || id === 'editor.redo' || id === 'editor.save' || id === 'editor.codeComplete') {
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
    },
    [activeTab, captureActiveSelection],
  );

  useGlobalShortcuts(shortcutHandlers, { isDisabled: shortcutsDisabled });

  const registerTerminalHandle = useCallback((leafId: number, h: TerminalPaneHandle | null) => {
    if (h) terminalRefs.current.set(leafId, h);
    else terminalRefs.current.delete(leafId);
  }, []);

  const registerEditorHandle = useCallback(
    (id: number, h: EditorPaneHandle | null) => {
      if (h) {
        editorRefs.current.set(id, h);
        const pending = pendingEditorNavigation.current.get(id);
        if (pending != null) {
          pendingEditorNavigation.current.delete(id);
          if (pending.line === undefined) h.focus();
          else h.gotoLine(pending.line, { focus: pending.focus });
        }
      } else {
        editorRefs.current.delete(id);
      }
      if (id === activeId) setActiveEditorHandle(h);
    },
    [activeId],
  );

  const registerPreviewHandle = useCallback(
    (id: number, h: PreviewPaneHandle | null) => {
      if (h) {
        previewRefs.current.set(id, h);
        if (pendingPreviewFocusRef.current === id) setTimeout(() => focusPendingPreview(id), 0);
      } else previewRefs.current.delete(id);
    },
    [focusPendingPreview],
  );

  const handlePreviewUrl = useCallback((id: number, url: string) => updateTab(id, { url }), [updateTab]);

  const authorizedCwds = useRef(new Set<string>());
  const handleTerminalCwd = useCallback(
    (leafId: number, cwd: string) => {
      setLeafCwd(leafId, cwd);
      if (cwd && !authorizedCwds.current.has(cwd)) {
        authorizedCwds.current.add(cwd);
        workspaceNative.workspaceAuthorize(cwd).catch(() => {
          authorizedCwds.current.delete(cwd);
        });
      }
    },
    [setLeafCwd],
  );

  const handleFocusLeaf = useCallback((tabId: number, leafId: number) => focusPane(tabId, leafId), [focusPane]);

  const onActivateAgent = activateAgentTarget;

  const handleLeafExit = useCallback(
    (leafId: number, _code: number) => {
      const all = nav().tabs;
      const tab = all.find((t) => t.kind === 'terminal' && hasLeaf(t.paneTree, leafId));
      if (!tab || tab.kind !== 'terminal') return;
      // Last pane of the last tab: quit instead of respawning a shell.
      if (leafIds(tab.paneTree).length === 1 && all.length === 1) {
        void getCurrentWindow().close();
      } else {
        closePaneByLeaf(leafId);
      }
    },
    [closePaneByLeaf],
  );

  const handleEditorDirty = useCallback((id: number, dirty: boolean) => updateTab(id, { dirty }), [updateTab]);

  const handleRenameTab = useCallback(
    (id: number, title: string) => updateTab(id, { customTitle: title.trim() }),
    [updateTab],
  );

  const navigatorItems = useNavigatorItems(activeSpaceId ?? DEFAULT_SPACE_ID);
  const tabActions = useMemo<TabNavigatorActions>(
    () => ({
      select: setActiveId,
      close: handleClose,
      closeToEnd: handleCloseTabsToRight,
      closeOthers: handleCloseOtherTabs,
      pin: pinTab,
      rename: handleRenameTab,
      reorder: reorderTabByGap,
    }),
    [setActiveId, handleClose, handleCloseTabsToRight, handleCloseOtherTabs, pinTab, handleRenameTab, reorderTabByGap],
  );

  const searchTarget = useMemo<SearchTarget>(() => {
    if (isTerminalTab && activeLeafId !== null && activeSearchAddon)
      return {
        kind: 'terminal',
        addon: activeSearchAddon,
        focus: () => terminalRefs.current.get(activeLeafId)?.focus(),
      };
    if (isEditorTab && activeEditorHandle)
      return {
        kind: 'editor',
        handle: activeEditorHandle,
        focus: () => activeEditorHandle.focus(),
      };
    if (isGitHistoryTab && gitHistoryHandle)
      return {
        kind: 'git-history',
        handle: gitHistoryHandle,
        focus: () => {},
      };
    return null;
  }, [
    isTerminalTab,
    isEditorTab,
    isGitHistoryTab,
    activeLeafId,
    activeSearchAddon,
    activeEditorHandle,
    gitHistoryHandle,
  ]);

  const activeCwd = activeTerminalLeafCwd;

  const handleNewSpace = useCallback(() => {
    const { spaces, create, setActive } = useSpaces.getState();
    const meta = create({
      name: `Space ${spaces.length + 1}`,
      root: activeCwd ?? home ?? null,
      env: workspaceEnv,
    });
    setActiveSpaceForNewTabs(meta.id);
    newTab(activeCwd ?? undefined);
    setActive(meta.id);
    return meta.id;
  }, [activeCwd, home, workspaceEnv, newTab, setActiveSpaceForNewTabs]);

  const handleDeleteSpace = useCallback(
    (id: string) => {
      const nextSpaceId = useSpaces.getState().remove(id);
      if (!nextSpaceId) return;
      const root = useSpaces.getState().spaces.find((s) => s.id === nextSpaceId)?.root;
      removeTabsForSpace(id, nextSpaceId, root ?? undefined);
    },
    [removeTabsForSpace],
  );

  const handleMoveTab = useCallback(
    (tabId: number, targetSpaceId: string) => {
      if (moveTabToSpace(tabId, targetSpaceId)) {
        useSpaces.getState().setActive(targetSpaceId);
      }
    },
    [moveTabToSpace],
  );

  const handleReorderTab = useCallback(
    (tabId: number, targetTabId: number, edge: 'top' | 'bottom') => {
      if (reorderTab(tabId, targetTabId, edge)) {
        const target = nav().tabs.find((x) => x.id === targetTabId);
        if (target) useSpaces.getState().setActive(target.spaceId);
      }
    },
    [reorderTab],
  );

  const handleNewTabInSpace = useCallback(
    (spaceId: string) => {
      const root = useSpaces.getState().spaces.find((s) => s.id === spaceId)?.root;
      newTabInSpace(spaceId, root ?? undefined);
    },
    [newTabInSpace],
  );

  const jumpToTab = useCallback(
    (tabId: number) => {
      const t = nav().tabs.find((x) => x.id === tabId);
      if (!t) return;
      setActiveId(tabId);
      useSpaces.getState().setActive(t.spaceId);
    },
    [setActiveId],
  );

  const commandPaletteItems = useMemo(
    () =>
      commandPaletteOpen
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
            toggleHiddenFiles,
            openSettings: () => void openSettingsWindow(),
            openKeyboardShortcuts: () => void openSettingsWindow('shortcuts'),
            spaces: useSpaces.getState().spaces,
            activeSpaceId,
            openSpacesOverview: () => openSidebarView('spaces'),
            newSpace: () => void handleNewSpace(),
            switchSpace: (id) => useSpaces.getState().setActive(id),
          })
        : [],
    [
      commandPaletteOpen,
      moveActivePane,
      tabs,
      activeId,
      searchTarget,
      explorerRoot,
      home,
      openNewTab,
      openNewPrivateTab,
      openPreviewTab,
      openGitGraphFromContext,
      toggleSourceControl,
      handleCloseTabOrPane,
      splitActivePaneInActiveTab,
      toggleSidebar,
      toggleTabOrientation,
      toggleTabsColumn,
      openSidebarView,
      toggleHiddenFiles,
      activeSpaceId,
      handleNewSpace,
    ],
  );

  const pendingEditorNavigation = useRef<Map<number, { line?: number; focus: boolean }>>(new Map());
  const openContentHit = useCallback(
    (path: string, line: number) => {
      const id = openFileTab(path, true);
      if (id == null) return;
      const h = editorRefs.current.get(id);
      if (h) h.gotoLine(line);
      else pendingEditorNavigation.current.set(id, { line, focus: true });
    },
    [openFileTab],
  );

  // `target.side` (open to the side) has no host support yet: plain open.
  const openPaletteFile = useCallback(
    (path: string, target: OpenFileTarget) => {
      if (target.line !== undefined) openContentHit(path, target.line);
      else handleOpenFile(path, true);
    },
    [openContentHit, handleOpenFile],
  );

  const openControlFile = useCallback(
    ({ path, line, focus, spaceId }: { path: string; line?: number; focus: boolean; spaceId: string }) => {
      if (focus && useSpaces.getState().activeId !== spaceId) {
        useSpaces.getState().setActive(spaceId);
      }
      const id = openFileTab(path, true, {
        spaceId,
        activate: focus,
      });
      const editor = editorRefs.current.get(id);
      if (line !== undefined) {
        if (editor) editor.gotoLine(line, { focus });
        else pendingEditorNavigation.current.set(id, { line, focus });
      } else if (focus) {
        if (editor) editor.focus();
        else pendingEditorNavigation.current.set(id, { focus: true });
      }
      return id;
    },
    [openFileTab],
  );

  useControlBridge({
    ready: spacesHydrated && launchCwdResolved,
    onOpen: openControlFile,
  });

  useEffect(() => {
    setLspNavigator({ openFile: openContentHit });
    return () => setLspNavigator(null);
  }, [openContentHit]);

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        {BenchBridge && (
          <Suspense fallback={null}>
            <BenchBridge
              tabs={tabs}
              activeId={activeId}
              booted={booted}
              setActiveId={setActiveId}
              newTab={newTab}
              newAgentGroupTab={newAgentGroupTab}
              splitActivePane={splitActivePane}
              closeTab={closeTab}
              readBuffer={(leafId, maxLines) => terminalRefs.current.get(leafId)?.getBuffer(maxLines) ?? null}
            />
          </Suspense>
        )}
        <AppShell
          titleBarPlacement={verticalTabs ? 'overlay' : 'inline'}
          focusMode={focusMode}
          titleBar={
            <TitleBar
              placement={verticalTabs ? 'overlay' : 'inline'}
              tabs={navigatorItems}
              tabActions={tabActions}
              onNew={openNewTab}
              onNewPrivate={openNewPrivateTab}
              onNewPreview={() => openPreviewTab('')}
              onNewEditor={() => setNewEditorOpen(true)}
              onNewGitGraph={openGitGraphFromContext}
              onLaunchAgents={launchAgentGroup}
              sidePanelsOpen={!sidebarCollapsed || (verticalTabs && !tabsColumnCollapsed)}
              onToggleSidebar={toggleSidePanels}
              onActivateAgent={onActivateAgent}
              onOpenSettings={() => void openSettingsWindow()}
              searchTarget={searchTarget}
              searchRef={searchInlineRef}
              cwd={activeCwd}
              filePath={activeFilePath}
              home={home}
              onCd={sendCd}
            />
          }
          tabsColumn={
            verticalTabs ? (
              <div className="h-full min-h-0 bg-frame">
                <TabNavigator
                  orientation="vertical"
                  heading={activeSpaceName}
                  items={navigatorItems}
                  actions={tabActions}
                  onNew={openNewTab}
                  onNewPrivate={openNewPrivateTab}
                  onNewPreview={() => openPreviewTab('')}
                  onNewEditor={() => setNewEditorOpen(true)}
                  onNewGitGraph={openGitGraphFromContext}
                  onLaunchAgents={launchAgentGroup}
                />
              </div>
            ) : null
          }
          tabsColumnRef={tabsColumnRef}
          tabsColumnInitialWidth={tabsColumnInitialWidth}
          onTabsColumnLayout={persistTabsColumnLayout}
          sidebarOpen={!sidebarCollapsed}
          tabsColumnOpen={!tabsColumnCollapsed}
          sidebarRef={sidebarRef}
          sidebarInitialWidth={sidebarCollapsed ? 0 : sidebarWidthRef.current}
          onSidebarLayout={persistSidebarWidth}
          onSidebarCollapsedChange={persistSidebarCollapsed}
          sidebar={
            <div className="h-full min-h-0">
              <div className="flex h-full min-h-0 flex-col overflow-hidden">
                <div key={sidebarView} className="min-h-0 flex-1 lut-panel-in">
                  {sidebarView === 'spaces' ? (
                    <SpacesView
                      tabs={tabs}
                      onNewSpace={() => void handleNewSpace()}
                      onDeleteSpace={handleDeleteSpace}
                      onNewTabInSpace={handleNewTabInSpace}
                      onJumpTab={jumpToTab}
                      onCloseTab={handleClose}
                      onMoveTabToSpace={handleMoveTab}
                      onReorderTab={handleReorderTab}
                      onReorderSpaces={(ids) => useSpaces.getState().reorder(ids)}
                    />
                  ) : sidebarView === 'explorer' ? (
                    <FileExplorer
                      ref={explorerRef}
                      rootPath={explorerRoot}
                      gitStatus={explorerGitDecorations ? sourceControl.status : null}
                      activeFilePath={explorerActiveFilePath}
                      onOpenFile={handleOpenFile}
                      onPathRenamed={handleExplorerPathRenamed}
                      onPathsDeleted={handlePathsDeleted}
                      canReplacePath={canReplaceExplorerPath}
                      onRevealInTerminal={cdInNewTab}
                      onOpenInSourceControl={handleOpenRepositoryInSourceControl}
                      onOpenGitHistory={handleOpenGitHistoryForPath}
                      pathDropTarget={terminalPathDropTarget}
                      visible={!sidebarCollapsed}
                    />
                  ) : (
                    <SourceControlPanel
                      open
                      sourceControl={sourceControl}
                      onOpenDiff={openGitDiffTab}
                      onOpenGitGraph={openGitGraphFromContext}
                      onOpenFile={handleOpenFile}
                      onNavigateToPath={cdInNewTab}
                      repositoryTarget={sourceControlRepositoryTarget}
                      onFollowRepositoryContext={handleFollowRepositoryContext}
                    />
                  )}
                </div>
                <SidebarRail
                  activeView={sidebarView}
                  onSelectView={persistSidebarView}
                  changedCount={sourceControl.changedCount}
                />
              </div>
            </div>
          }
          workspace={
            <WorkspaceSurface
              insetFromSidePanel={!focusMode && (!sidebarCollapsed || (verticalTabs && !tabsColumnCollapsed))}
              tabs={tabs}
              activeId={activeId}
              activeTab={activeTab}
              registerTerminalHandle={registerTerminalHandle}
              onSearchReady={handleSearchReady}
              onCwd={handleTerminalCwd}
              onExit={handleLeafExit}
              onFocusLeaf={handleFocusLeaf}
              onSplitRatios={setSplitRatios}
              registerEditorHandle={registerEditorHandle}
              onEditorDirtyChange={handleEditorDirty}
              onEditorCloseTab={disposeTab}
              registerPreviewHandle={registerPreviewHandle}
              onPreviewUrlChange={handlePreviewUrl}
              onOpenCommitFile={openCommitFileDiffTab}
              onGitHistorySearchHandle={setGitHistoryHandle}
              onSetMarkdownView={setMarkdownView}
            />
          }
        >
          <WindowVibrancyBridge />
          {IS_MAC ? <LivePageResizeBridge /> : null}
          <WindowActivityBridge
            bindFocus={bindTerminalWindowFocus}
            subscribePresentation={subscribeWindowPresentation}
          />

          <AgentNotificationsBridge tabs={tabs} activeId={activeId} onActivate={onActivateAgent} />
          <Toaster position="bottom-right" />

          {switcherState && <TabSwitcher items={navigatorItems} state={switcherState} />}

          <CommandPalette
            open={commandPaletteOpen}
            onOpenChange={setCommandPaletteOpen}
            initialMode={paletteInitialMode}
            commandItems={commandPaletteItems}
            workspaceRoot={explorerRoot}
            onOpenContentHit={openContentHit}
            onOpenFile={openPaletteFile}
          />

          <NewEditorDialog
            open={newEditorOpen}
            onOpenChange={setNewEditorOpen}
            rootPath={explorerRoot ?? home}
            onCreated={(path) => openFileTab(path)}
          />

          <CloseDialogs
            tabs={tabs}
            pendingCloseTab={pendingCloseTab}
            onCancelClose={cancelClose}
            onConfirmClose={confirmClose}
            pendingTerminalCloseTab={pendingTerminalCloseTab}
            onCancelTerminalClose={cancelTerminalClose}
            onConfirmTerminalClose={confirmTerminalClose}
            pendingDeleteTabs={pendingDeleteTabs}
            onCancelDeleteClose={cancelDeleteClose}
            onConfirmDeleteClose={confirmDeleteClose}
            pendingCloseMany={pendingCloseMany}
            closeManyConfirming={closeManyConfirming}
            onCancelCloseMany={cancelCloseMany}
            onConfirmCloseMany={confirmCloseMany}
            pendingAppClose={pendingAppClose}
            onCancelAppClose={cancelAppClose}
            onConfirmAppClose={confirmAppClose}
          />
        </AppShell>
      </TooltipProvider>
    </ThemeProvider>
  );

  return shell;
}
