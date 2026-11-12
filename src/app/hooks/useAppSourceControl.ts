import { DEFAULT_SPACE_ID, useNavigationStore } from '@/modules/navigation';
import { usePreferencesStore } from '@/modules/settings/preferences';
import type { SidebarViewId } from '@/modules/sidebar';
import { useRepositoryTargeting, useSourceControlContext } from '@/modules/source-control';
import { useSpaces } from '@/modules/spaces';
import type { Tab } from '@/modules/tabs';
import { useWorkspaceEnvStore, type WorkspaceEnv, workspaceScopeKey } from '@/modules/workspace';
import { useCallback } from 'react';

type AppSourceControlArgs = {
  tabs: Tab[];
  activeTab: Tab | undefined;
  /** The active terminal pane's directory. */
  activeCwd: string | null;
  explorerRoot: string | null;
  home: string | null;
  launchCwd: string | null;
  launchCwdResolved: boolean;
  activeSpaceId: string | null;
  workspaceEnv: WorkspaceEnv;
  sidebarView: SidebarViewId;
  sidebarCollapsed: boolean;
  cycleSidebarView: (view: SidebarViewId) => void;
  openSourceControl: () => void;
};

/**
 * The Git panel's state for the window (E09-08): the repository it targets in the active space and workspace, the
 * status the panel and the explorer show, and the commands that open it, the graph and a path's history.
 */
export function useAppSourceControl({
  tabs,
  activeTab,
  activeCwd,
  explorerRoot,
  home,
  launchCwd,
  launchCwdResolved,
  activeSpaceId,
  workspaceEnv,
  sidebarView,
  sidebarCollapsed,
  cycleSidebarView,
  openSourceControl,
}: AppSourceControlArgs) {
  const openCommitHistoryTab = useNavigationStore((s) => s.openCommitHistoryTab);
  const isRepositoryContextCurrent = useCallback((spaceId: string, workspaceKey: string) => {
    const currentSpaceId = useSpaces.getState().activeId ?? DEFAULT_SPACE_ID;
    const currentWorkspaceKey = workspaceScopeKey(useWorkspaceEnvStore.getState().env);
    return spaceId === currentSpaceId && workspaceKey === currentWorkspaceKey;
  }, []);
  const { repositoryTarget, openInSourceControl, openGitHistory, followActiveContext } =
    useRepositoryTargeting({
      spaceId: activeSpaceId ?? DEFAULT_SPACE_ID,
      workspaceKey: workspaceScopeKey(workspaceEnv),
      isContextCurrent: isRepositoryContextCurrent,
      openSourceControl,
      openCommitHistoryTab,
    });
  const explorerGitDecorations = usePreferencesStore((s) => s.explorerGitDecorations);
  const { sourceControl, toggleSourceControl, openGitGraphFromContext } = useSourceControlContext({
    activeTab,
    tabs,
    activeTerminalLeafCwd: activeCwd,
    explorerRoot,
    launchCwd,
    launchCwdResolved,
    home,
    sidebarView,
    sidebarCollapsed,
    explorerGitDecorations,
    repositoryTarget,
    cycleSidebarView,
    openCommitHistoryTab,
  });

  return {
    sourceControl,
    explorerGitDecorations,
    repositoryTarget,
    openInSourceControl,
    openGitHistory,
    followActiveContext,
    toggleSourceControl,
    openGitGraphFromContext,
  };
}
