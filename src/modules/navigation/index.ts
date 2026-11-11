export { hasUnsavedChanges, registerDirtyContentProvider } from './dirtyContent';
export {
  type TabNavigatorActions,
  type TabNavigatorItem,
  type TabNavigatorOrientation,
  useNavigatorItems,
} from './navigator';
export {
  applyCloseTabsPlan,
  nextActiveInSpace,
  planCloseOtherTabs,
  planCloseTabsToRight,
  planSingleTabClose,
} from './planners/close';
export {
  planCommitHistoryOpen,
  planFileTabOpen,
  planGitDiffOpen,
  planMarkdownTabOpen,
} from './planners/open';
export {
  neighborTerminalTab,
  pickTabBySpaceIndex,
  reorderTabsByGap,
  switcherOrder,
} from './planners/order';
export { planSpaceRemoval } from './planners/spaces';
export { initialNavigationData, type NavigationState, useNavigationStore } from './store';
export { registerTabPresenter, TabIcon, TabStatus } from './TabIcon';
export { labelFor } from './tabLabel';
export {
  type CloseTabsPlan,
  DEFAULT_SPACE_ID,
  type EditorTab,
  type GitCommitFileDiffTab,
  type GitDiffOpenInput,
  type GitDiffTab,
  type GitHistoryTab,
  type MarkdownTab,
  MAX_PANES_PER_TAB,
  type PreviewTab,
  type Tab,
  type TerminalTab,
} from './types';
