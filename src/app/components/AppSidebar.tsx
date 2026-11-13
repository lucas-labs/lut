import { FileExplorer } from '@/modules/explorer';
import { useNavigationStore } from '@/modules/navigation';
import { SidebarRail } from '@/modules/sidebar';
import { GitPanel } from '@/modules/source-control';
import { SpacesView } from '@/modules/spaces';
import type { Tab } from '@/modules/tabs';
import type { TerminalPathDropTarget } from '@/modules/terminal';
import { useCallback } from 'react';
import { hasOpenPathTab, renamedPath } from '../hooks/tabCloseGuards';
import type { useAppSourceControl } from '../hooks/useAppSourceControl';
import type { useSidePanels } from '../hooks/useSidePanels';
import type { useWorkspaceCoordinator } from '../hooks/useWorkspaceCoordinator';
import { explorerFilePath } from '../lib/activeFilePath';

/** The navigation store's current state, for callbacks that must not close over a render's. */
const nav = () => useNavigationStore.getState();

type Props = {
  tabs: Tab[];
  activeTab: Tab | undefined;
  explorerRoot: string | null;
  panels: Pick<
    ReturnType<typeof useSidePanels>,
    'sidebarView' | 'sidebarCollapsed' | 'persistSidebarView' | 'explorerRef'
  >;
  workspace: ReturnType<typeof useWorkspaceCoordinator>;
  git: ReturnType<typeof useAppSourceControl>;
  pathDropTarget: TerminalPathDropTarget;
  openFile: (path: string, pin?: boolean) => void;
  /** Opens a terminal tab at a path. */
  cdInNewTab: (path: string) => void;
  closeTab: (id: number) => void;
  /** Closes the tabs of files the explorer deleted, asking first for unsaved ones. */
  onPathsDeleted: (paths: string[]) => void;
};

/** The sidebar (E09-08): the spaces, explorer or Git view, and the rail that switches them. */
export function AppSidebar({
  tabs,
  activeTab,
  explorerRoot,
  panels: { sidebarView, sidebarCollapsed, persistSidebarView, explorerRef },
  workspace,
  git,
  pathDropTarget,
  openFile,
  cdInNewTab,
  closeTab,
  onPathsDeleted,
}: Props) {
  const openGitDiffTab = useNavigationStore((s) => s.openGitDiffTab);
  const onExplorerPathRenamed = useCallback((from: string, to: string) => {
    for (const tab of nav().tabs) {
      if (tab.kind !== 'editor' && tab.kind !== 'markdown') continue;
      const path = renamedPath(tab.path, from, to);
      if (path === null) continue;
      const i = path.lastIndexOf('/');
      nav().updateTab(tab.id, {
        path,
        title: i === -1 ? path : path.slice(i + 1),
      });
    }
  }, []);

  const canReplaceExplorerPath = useCallback((path: string) => !hasOpenPathTab(nav().tabs, path), []);

  return (
    <div className="h-full min-h-0">
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div key={sidebarView} className="min-h-0 flex-1 lut-panel-in">
          {sidebarView === 'spaces' ? (
            <SpacesView
              tabs={tabs}
              onNewSpace={() => void workspace.newSpace()}
              onDeleteSpace={workspace.deleteSpace}
              onNewTabInSpace={workspace.newTabInSpace}
              onJumpTab={workspace.jumpToTab}
              onCloseTab={closeTab}
              onMoveTabToSpace={workspace.moveTabToSpace}
              onReorderTab={workspace.reorderTab}
              onReorderSpaces={workspace.reorderSpaces}
            />
          ) : sidebarView === 'explorer' ? (
            <FileExplorer
              ref={explorerRef}
              rootPath={explorerRoot}
              gitStatus={git.explorerGitDecorations ? git.sourceControl.status : null}
              activeFilePath={explorerFilePath(activeTab)}
              onOpenFile={openFile}
              onPathRenamed={onExplorerPathRenamed}
              onPathsDeleted={onPathsDeleted}
              canReplacePath={canReplaceExplorerPath}
              onRevealInTerminal={cdInNewTab}
              onOpenInSourceControl={git.openInSourceControl}
              onOpenGitHistory={git.openGitHistory}
              pathDropTarget={pathDropTarget}
              visible={!sidebarCollapsed}
            />
          ) : (
            <GitPanel
              open
              sourceControl={git.sourceControl}
              onOpenDiff={openGitDiffTab}
              onOpenGitGraph={git.openGitGraphFromContext}
              onOpenFile={openFile}
              onNavigateToPath={cdInNewTab}
              repositoryTarget={git.repositoryTarget}
              onFollowRepositoryContext={git.followActiveContext}
            />
          )}
        </div>
        <SidebarRail
          activeView={sidebarView}
          onSelectView={persistSidebarView}
          changedCount={git.sourceControl.changedCount}
        />
      </div>
    </div>
  );
}
