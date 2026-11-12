import { TooltipProvider } from '@/components/ui/tooltip';
import { useZoom } from '@/lib/useZoom';
import { useControlBridge } from '@/modules/control';
import { type SearchInlineHandle, TitleBar } from '@/modules/header';
import { DEFAULT_SPACE_ID, useNavigatorItems } from '@/modules/navigation';
import { getLaunchDir } from '@/modules/platform';
import { openSettingsWindow } from '@/modules/settings/openSettingsWindow';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { TabNavigator, useTabs, useWindowTitle, useWorkspaceCwd } from '@/modules/tabs';
import { findLeafCwd } from '@/modules/terminal';
import { ThemeProvider, useThemeFileEditing } from '@/modules/theme';
import { useEffect, useRef, useState } from 'react';
import { AppShell } from './AppShell';
import { AppOverlays } from './components/AppOverlays';
import { AppSidebar } from './components/AppSidebar';
import { WorkspaceSurface } from './components/WorkspaceSurface';
import { useAppCloseGuard } from './hooks/useAppCloseGuard';
import { useAppShortcuts } from './hooks/useAppShortcuts';
import { useAppSourceControl } from './hooks/useAppSourceControl';
import { useCommandPalette } from './hooks/useCommandPalette';
import { useEditorPanes } from './hooks/useEditorPanes';
import { useLaunchFiles } from './hooks/useLaunchFiles';
import { usePreviewPanes } from './hooks/usePreviewPanes';
import { useSearchTarget } from './hooks/useSearchTarget';
import { useSidePanels } from './hooks/useSidePanels';
import { useTabClosing } from './hooks/useTabClosing';
import { useTabCommands } from './hooks/useTabCommands';
import { useTerminalPanes } from './hooks/useTerminalPanes';
import { useWorkspaceCoordinator } from './hooks/useWorkspaceCoordinator';
import { breadcrumbFilePath } from './lib/activeFilePath';
import { registerTabPresenters } from './tabPresenters';

registerTabPresenters();

/**
 * The main window (E09-08): composes the window's services and hooks with `AppShell`. The logic lives in the hooks
 * (`./hooks`) and in the sidebar and overlay components.
 */
export default function App() {
  const {
    tabs,
    activeId,
    booted,
    openFileTab,
    setSplitRatios,
    setMarkdownView,
    openCommitFileDiffTab,
    selectByIndex,
    focusNextPaneInTab,
  } = useTabs(getLaunchDir() ? { cwd: getLaunchDir() } : undefined);

  // Load the saved preferences into this window and follow changes made in
  // Settings. Spaces boot only does it on a first launch with no saved spaces.
  const initPreferences = usePreferencesStore((s) => s.init);
  useEffect(() => {
    void initPreferences();
  }, [initPreferences]);

  const activeTab = tabs.find((t) => t.id === activeId);
  const activeLeafId = activeTab?.kind === 'terminal' ? activeTab.activeLeafId : null;
  const activeCwd =
    activeTab?.kind === 'terminal'
      ? (findLeafCwd(activeTab.paneTree, activeTab.activeLeafId) ?? activeTab.cwd ?? null)
      : null;

  const workspace = useWorkspaceCoordinator({ activeCwd });
  const { home, launchCwd, activeSpaceId } = workspace;
  const panels = useSidePanels();
  const terminals = useTerminalPanes({ tabs, activeId, activeLeafId });
  const editors = useEditorPanes({ tabs, activeId });
  const previews = usePreviewPanes();
  useThemeFileEditing({ openFileTab });
  const { explorerRoot, inheritedCwdForNewTab } = useWorkspaceCwd(activeTab, tabs, launchCwd ?? home);
  useWindowTitle(activeTab, explorerRoot);
  const zoom = useZoom();
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
  const [newEditorOpen, setNewEditorOpen] = useState(false);

  const closeGuards = useTabClosing({
    tabs,
    activeId,
    forgetEditor: editors.forgetEditor,
    forgetPreview: previews.forgetPreview,
    newTabInSpace: workspace.newTabInSpace,
  });
  const appClose = useAppCloseGuard();
  const commands = useTabCommands({ ...closeGuards, activeId, activeSpaceId, inheritedCwdForNewTab });
  const git = useAppSourceControl({ ...workspace, ...panels, tabs, activeTab, activeCwd, explorerRoot });
  const { searchTarget, onGitHistorySearchHandle } = useSearchTarget({
    activeTab,
    activeLeafId,
    activeSearchAddon: terminals.activeSearchAddon,
    focusTerminal: terminals.focusTerminal,
    activeEditorHandle: editors.activeEditorHandle,
  });
  const palette = useCommandPalette({
    ...workspace,
    ...panels,
    ...commands,
    ...git,
    tabs,
    activeId,
    searchTarget,
    explorerRoot,
    openPreviewTab: previews.openPreviewTab,
    setNewEditorOpen,
    searchInlineRef,
  });

  useLaunchFiles({ booted, openFile: commands.openFile });
  useControlBridge({
    ready: workspace.spacesHydrated && workspace.launchCwdResolved,
    onOpen: editors.openControlFile,
  });
  useAppShortcuts({
    ...workspace,
    ...panels,
    ...commands,
    ...git,
    ...zoom,
    activeId,
    activeTab,
    editorRefs: editors.editorRefs,
    searchInlineRef,
    selectByIndex,
    focusNextPaneInTab,
    openCommandPalette: palette.openCommandPalette,
    openPreviewTab: previews.openPreviewTab,
    setNewEditorOpen,
  });

  const navigatorItems = useNavigatorItems(activeSpaceId ?? DEFAULT_SPACE_ID);
  // The new-tab menu, in the header and in the vertical tab column.
  const newTabMenu = {
    onNew: commands.openNewTab,
    onNewPrivate: commands.openNewPrivateTab,
    onNewPreview: () => previews.openPreviewTab(''),
    onNewEditor: () => setNewEditorOpen(true),
    onNewGitGraph: git.openGitGraphFromContext,
    onLaunchAgents: commands.launchAgentGroup,
  };
  const { verticalTabs, sidebarCollapsed, tabsColumnCollapsed, focusMode } = panels;

  return (
    <ThemeProvider>
      <TooltipProvider>
        <AppShell
          titleBarPlacement={verticalTabs ? 'overlay' : 'inline'}
          focusMode={focusMode}
          titleBar={
            <TitleBar
              placement={verticalTabs ? 'overlay' : 'inline'}
              tabs={navigatorItems}
              tabActions={commands.tabActions}
              {...newTabMenu}
              sidePanelsOpen={panels.sidePanelsOpen}
              onToggleSidebar={panels.toggleSidePanels}
              onActivateAgent={commands.activateAgentTarget}
              onOpenSettings={() => void openSettingsWindow()}
              searchTarget={searchTarget}
              searchRef={searchInlineRef}
              cwd={activeCwd}
              filePath={breadcrumbFilePath(activeTab)}
              home={home}
              onCd={terminals.sendCd}
            />
          }
          tabsColumn={
            verticalTabs ? (
              <div className="h-full min-h-0">
                <TabNavigator
                  orientation="vertical"
                  heading={workspace.activeSpaceName}
                  items={navigatorItems}
                  actions={commands.tabActions}
                  {...newTabMenu}
                />
              </div>
            ) : null
          }
          tabsColumnRef={panels.tabsColumnRef}
          tabsColumnInitialWidth={panels.tabsColumnInitialWidth}
          onTabsColumnLayout={panels.persistTabsColumnLayout}
          sidebarOpen={!sidebarCollapsed}
          tabsColumnOpen={!tabsColumnCollapsed}
          sidebarRef={panels.sidebarRef}
          sidebarInitialWidth={sidebarCollapsed ? 0 : panels.sidebarWidthRef.current}
          onSidebarLayout={panels.persistSidebarWidth}
          onSidebarCollapsedChange={panels.persistSidebarCollapsed}
          sidebar={
            <AppSidebar
              tabs={tabs}
              activeTab={activeTab}
              explorerRoot={explorerRoot}
              panels={panels}
              workspace={workspace}
              git={git}
              pathDropTarget={terminals.pathDropTarget}
              openFile={commands.openFile}
              cdInNewTab={terminals.cdInNewTab}
              closeTab={closeGuards.handleClose}
              onPathsDeleted={closeGuards.handlePathsDeleted}
            />
          }
          workspace={
            <WorkspaceSurface
              insetFromSidePanel={!focusMode && panels.sidePanelsOpen}
              tabs={tabs}
              activeId={activeId}
              activeTab={activeTab}
              registerTerminalHandle={terminals.registerTerminalHandle}
              onSearchReady={terminals.onSearchReady}
              onCwd={terminals.onCwd}
              onExit={terminals.onExit}
              onFocusLeaf={terminals.onFocusLeaf}
              onSplitRatios={setSplitRatios}
              registerEditorHandle={editors.registerEditorHandle}
              onEditorDirtyChange={editors.onDirtyChange}
              onEditorCloseTab={closeGuards.disposeTab}
              registerPreviewHandle={previews.registerPreviewHandle}
              onPreviewUrlChange={previews.onUrlChange}
              onOpenCommitFile={openCommitFileDiffTab}
              onGitHistorySearchHandle={onGitHistorySearchHandle}
              onSetMarkdownView={setMarkdownView}
            />
          }
        >
          <AppOverlays
            tabs={tabs}
            activeId={activeId}
            booted={booted}
            readBuffer={terminals.readBuffer}
            navigatorItems={navigatorItems}
            switcherState={commands.switcherState}
            onActivateAgent={commands.activateAgentTarget}
            palette={palette}
            explorerRoot={explorerRoot}
            home={home}
            openFile={commands.openFile}
            openFileAtLine={editors.openFileAtLine}
            newEditorOpen={newEditorOpen}
            setNewEditorOpen={setNewEditorOpen}
            closeGuards={closeGuards}
            appClose={appClose}
          />
        </AppShell>
      </TooltipProvider>
    </ThemeProvider>
  );
}
