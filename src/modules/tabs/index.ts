export { selectLiveTerminals } from './lib/liveTerminals';
export { selectTabAgentStatus } from './lib/tabAgentStatus';
export { useTabs } from './lib/useTabs';
export { TABS_COLUMN_MAX_WIDTH, TABS_COLUMN_MIN_WIDTH, useTabsColumn } from './lib/useTabsColumn';
export { useTabSwitcher } from './lib/useTabSwitcher';
export { useWindowTitle } from './lib/useWindowTitle';
export { useWorkspaceCwd } from './lib/useWorkspaceCwd';
export { TabBar } from './TabBar';
export { TabSwitcherHud } from './TabSwitcherHud';
export {
  type CloseTabsPlan,
  type EditorTab,
  type GitCommitFileDiffTab,
  type GitDiffTab,
  type GitHistoryTab,
  type MarkdownTab,
  MAX_PANES_PER_TAB,
  nextActiveInSpace,
  planCloseOtherTabs,
  planCloseTabsToRight,
  type PreviewTab,
  type Tab,
} from '@/modules/navigation';
