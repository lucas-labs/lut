import type { SearchTarget } from '@/modules/header';
import { neighborTerminalTab } from '@/modules/navigation';
import { MAX_PANES_PER_TAB, type Tab } from '@/modules/tabs';
import { leafIds } from '@/modules/terminal';
import {
  ArrowMoveUpRightIcon,
  Cancel01Icon,
  CenterFocusIcon,
  DashboardSquare01Icon,
  FileEditIcon,
  FileSearchIcon,
  FullScreenIcon,
  Globe02Icon,
  IncognitoIcon,
  KeyboardIcon,
  LayoutLeftIcon,
  LayoutTwoColumnIcon,
  LayoutTwoRowIcon,
  MoveLeftIcon,
  MoveRightIcon,
  PaintBoardIcon,
  Search01Icon,
  Settings01Icon,
  SidebarLeftIcon,
  SourceCodeIcon,
  TerminalIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons';
import type { PaletteItem } from './types';

export const COMMAND_GROUPS = [
  'General',
  'Spaces',
  'Tabs',
  'Panes',
  'Git',
  'Search',
  'View',
] as const;

export type CommandPaletteActionContext = {
  tabs: Tab[];
  activeId: number;
  searchTarget: SearchTarget;
  explorerRoot: string | null;
  home: string | null;
  openNewTab: () => void;
  openNewPrivate: () => void;
  openNewEditor: () => void;
  openNewPreview: () => void;
  openGitGraph: () => void;
  toggleSourceControl: () => void;
  closeActiveTabOrPane: () => void;
  splitPaneRight: () => void;
  splitPaneDown: () => void;
  movePaneToNewTab: () => void;
  movePaneToNextTab: () => void;
  movePaneToPrevTab: () => void;
  focusSearch: () => void;
  focusExplorerSearch: () => void;
  toggleSidebar: () => void;
  toggleTabOrientation: () => void;
  toggleTabsColumn: () => void;
  toggleFocusMode: () => void;
  toggleFullScreen: () => void;
  toggleHiddenFiles: () => void;
  openSettings: () => void;
  openKeyboardShortcuts: () => void;
  spaces: { id: string; name: string }[];
  activeSpaceId: string | null;
  openSpacesOverview: () => void;
  newSpace: () => void;
  switchSpace: (id: string) => void;
};

const noop = () => {};

export function createCommandItems(ctx: CommandPaletteActionContext): PaletteItem[] {
  const activeTab = ctx.tabs.find((tab) => tab.id === ctx.activeId);
  const activeTerminalTab = activeTab?.kind === 'terminal' ? activeTab : null;
  const activePaneCount = activeTerminalTab ? leafIds(activeTerminalTab.paneTree).length : 0;
  const onlyOneTab = ctx.tabs.length < 2;
  const noWorkspaceRoot = !ctx.explorerRoot && !ctx.home;
  const splitDisabled = !activeTerminalTab
    ? 'No terminal tab'
    : activePaneCount >= MAX_PANES_PER_TAB
      ? 'Pane limit'
      : undefined;
  const closeDisabled = onlyOneTab && activePaneCount < 2 ? 'Last tab' : undefined;
  const moveToNewDisabled = !activeTerminalTab
    ? 'No terminal tab'
    : activePaneCount < 2
      ? 'Only pane'
      : undefined;
  const moveToNeighborDisabled = (delta: 1 | -1) => {
    if (!activeTerminalTab) return 'No terminal tab';
    const neighbor = neighborTerminalTab(ctx.tabs, activeTerminalTab.id, delta);
    if (neighbor?.kind !== 'terminal') return 'No terminal tab there';
    return leafIds(neighbor.paneTree).length >= MAX_PANES_PER_TAB ? 'Pane limit' : undefined;
  };

  return [
    {
      id: 'settings.open',
      title: 'Open settings',
      group: 'General',
      keywords: ['preferences', 'config'],
      icon: Settings01Icon,
      shortcutId: 'settings.open',
      run: ctx.openSettings,
    },
    {
      id: 'theme.pick',
      title: 'Change theme...',
      group: 'General',
      keywords: ['theme', 'appearance', 'color', 'dark', 'light'],
      icon: PaintBoardIcon,
      run: noop,
    },
    {
      id: 'shortcuts.open',
      title: 'Keyboard shortcuts',
      group: 'General',
      keywords: ['keys', 'keybindings', 'settings'],
      icon: KeyboardIcon,
      run: ctx.openKeyboardShortcuts,
    },
    {
      id: 'spaces.overview',
      title: 'Spaces: Overview',
      group: 'Spaces',
      keywords: ['spaces', 'sessions', 'overview', 'organize', 'manage', 'move'],
      icon: DashboardSquare01Icon,
      run: ctx.openSpacesOverview,
    },
    {
      id: 'spaces.new',
      title: 'New Space',
      group: 'Spaces',
      keywords: ['space', 'session', 'workspace', 'group', 'create'],
      icon: DashboardSquare01Icon,
      run: ctx.newSpace,
    },
    ...ctx.spaces.map((sp) => ({
      id: `spaces.switch.${sp.id}`,
      title: `Switch to ${sp.name}`,
      group: 'Spaces' as const,
      keywords: ['space', 'switch', 'session', sp.name],
      icon: DashboardSquare01Icon,
      disabledReason: sp.id === ctx.activeSpaceId ? 'Current space' : undefined,
      run: () => ctx.switchSpace(sp.id),
    })),
    {
      id: 'tab.new',
      title: 'New terminal',
      group: 'Tabs',
      keywords: ['shell', 'terminal', 'new tab'],
      icon: TerminalIcon,
      shortcutId: 'tab.new',
      run: ctx.openNewTab,
    },
    {
      id: 'tab.newPrivate',
      title: 'New private terminal',
      group: 'Tabs',
      keywords: ['privacy', 'private', 'incognito', 'ephemeral'],
      icon: IncognitoIcon,
      shortcutId: 'tab.newPrivate',
      run: ctx.openNewPrivate,
    },
    {
      id: 'tab.newEditor',
      title: 'New editor tab',
      group: 'Tabs',
      keywords: ['file', 'editor', 'create'],
      icon: FileEditIcon,
      shortcutId: 'tab.newEditor',
      disabledReason: noWorkspaceRoot ? 'No workspace root' : undefined,
      run: ctx.openNewEditor,
    },
    {
      id: 'tab.newPreview',
      title: 'New web preview',
      group: 'Tabs',
      keywords: ['browser', 'web', 'localhost', 'preview'],
      icon: Globe02Icon,
      shortcutId: 'tab.newPreview',
      run: ctx.openNewPreview,
    },
    {
      id: 'tab.close',
      title: 'Close tab or pane',
      group: 'Tabs',
      keywords: ['close', 'remove', 'pane'],
      icon: Cancel01Icon,
      shortcutId: 'tab.close',
      disabledReason: closeDisabled,
      run: ctx.closeActiveTabOrPane,
    },
    {
      id: 'pane.splitRight',
      title: 'Split pane right',
      group: 'Panes',
      keywords: ['terminal', 'pane', 'split', 'right', 'column'],
      icon: LayoutTwoColumnIcon,
      shortcutId: 'pane.splitRight',
      disabledReason: splitDisabled,
      run: ctx.splitPaneRight,
    },
    {
      id: 'pane.splitDown',
      title: 'Split pane down',
      group: 'Panes',
      keywords: ['terminal', 'pane', 'split', 'down', 'row'],
      icon: LayoutTwoRowIcon,
      shortcutId: 'pane.splitDown',
      disabledReason: splitDisabled,
      run: ctx.splitPaneDown,
    },
    {
      id: 'pane.moveToNewTab',
      title: 'Move pane to a new tab',
      group: 'Panes',
      keywords: ['terminal', 'pane', 'move', 'detach', 'tab'],
      icon: ArrowMoveUpRightIcon,
      shortcutId: 'pane.moveToNewTab',
      disabledReason: moveToNewDisabled,
      run: ctx.movePaneToNewTab,
    },
    {
      id: 'pane.moveToNextTab',
      title: 'Move pane to the next tab',
      group: 'Panes',
      keywords: ['terminal', 'pane', 'move', 'tab', 'next'],
      icon: MoveRightIcon,
      shortcutId: 'pane.moveToNextTab',
      disabledReason: moveToNeighborDisabled(1),
      run: ctx.movePaneToNextTab,
    },
    {
      id: 'pane.moveToPrevTab',
      title: 'Move pane to the previous tab',
      group: 'Panes',
      keywords: ['terminal', 'pane', 'move', 'tab', 'previous'],
      icon: MoveLeftIcon,
      shortcutId: 'pane.moveToPrevTab',
      disabledReason: moveToNeighborDisabled(-1),
      run: ctx.movePaneToPrevTab,
    },
    {
      id: 'git.graph',
      title: 'Open git graph',
      group: 'Git',
      keywords: ['git', 'graph', 'history', 'log', 'commits'],
      icon: SourceCodeIcon,
      run: ctx.openGitGraph,
    },
    {
      id: 'git.source',
      title: 'Toggle source control',
      group: 'Git',
      keywords: ['git', 'source control', 'changes', 'staging', 'diff'],
      icon: SourceCodeIcon,
      shortcutId: 'pane.source',
      run: ctx.toggleSourceControl,
    },
    {
      id: 'search.content',
      title: 'Find content in files',
      group: 'Search',
      keywords: ['grep', 'ripgrep', 'text', 'contents', 'search in files'],
      icon: FileSearchIcon,
      trailing: '#',
      run: noop,
    },
    {
      id: 'search.focus',
      title: 'Find in current tab',
      group: 'Search',
      keywords: ['find', 'terminal', 'editor', 'current'],
      icon: Search01Icon,
      shortcutId: 'search.focus',
      disabledReason: ctx.searchTarget ? undefined : 'No searchable view',
      run: ctx.focusSearch,
    },
    {
      id: 'explorer.search',
      title: 'Search files by name',
      group: 'Search',
      keywords: ['explorer', 'workspace', 'file', 'open'],
      icon: Search01Icon,
      shortcutId: 'explorer.search',
      disabledReason: ctx.explorerRoot ? undefined : 'No workspace root',
      run: ctx.focusExplorerSearch,
    },
    {
      id: 'sidebar.toggle',
      title: 'Toggle file explorer',
      group: 'View',
      keywords: ['sidebar', 'files', 'explorer'],
      icon: SidebarLeftIcon,
      shortcutId: 'sidebar.toggle',
      run: ctx.toggleSidebar,
    },
    {
      id: 'view.tabOrientation',
      title: 'Toggle vertical tabs',
      group: 'View',
      keywords: ['tabs', 'vertical', 'horizontal', 'orientation', 'layout'],
      icon: LayoutLeftIcon,
      shortcutId: 'view.tabOrientation',
      run: ctx.toggleTabOrientation,
    },
    {
      id: 'view.tabsColumn',
      title: 'Show or hide the vertical tab column',
      group: 'View',
      keywords: ['tabs', 'vertical', 'column', 'hide', 'collapse'],
      icon: LayoutLeftIcon,
      shortcutId: 'view.tabsColumn',
      run: ctx.toggleTabsColumn,
    },
    {
      id: 'view.focusMode',
      title: 'Toggle focus mode',
      group: 'View',
      keywords: ['zen', 'focus', 'distraction', 'chrome', 'hide', 'full screen'],
      icon: CenterFocusIcon,
      shortcutId: 'view.focusMode',
      run: ctx.toggleFocusMode,
    },
    {
      id: 'view.fullScreen',
      title: 'Toggle full screen',
      group: 'View',
      keywords: ['full screen', 'fullscreen', 'window'],
      icon: FullScreenIcon,
      shortcutId: 'view.fullScreen',
      run: ctx.toggleFullScreen,
    },
    {
      id: 'explorer.toggleHidden',
      title: 'Toggle hidden files',
      group: 'View',
      keywords: ['dotfiles', 'hidden', 'explorer', 'gitignore', 'env'],
      icon: ViewIcon,
      shortcutId: 'explorer.toggleHidden',
      run: ctx.toggleHiddenFiles,
    },
  ];
}
