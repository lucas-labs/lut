import type { Tab } from '@/modules/tabs';
import { describe, expect, it } from 'vitest';
import { type CommandPaletteActionContext, createCommandItems } from './commands';

function terminalTab(id: number): Tab {
  return {
    id,
    kind: 'terminal',
    spaceId: 's',
    title: 'shell',
    paneTree: { kind: 'leaf', id: id * 10 },
    activeLeafId: id * 10,
  } as unknown as Tab;
}

function baseContext(over: Partial<CommandPaletteActionContext> = {}): CommandPaletteActionContext {
  const noop = () => {};
  return {
    tabs: [terminalTab(1)],
    activeId: 1,
    searchTarget: 'content' as never,
    explorerRoot: '/workspace',
    home: '/home/me',
    spaces: [],
    activeSpaceId: null,
    openNewTab: noop,
    openNewPrivate: noop,
    openNewEditor: noop,
    openNewPreview: noop,
    openGitGraph: noop,
    toggleSourceControl: noop,
    closeActiveTabOrPane: noop,
    splitPaneRight: noop,
    splitPaneDown: noop,
    movePaneToNewTab: noop,
    movePaneToNextTab: noop,
    movePaneToPrevTab: noop,
    focusPaneInDirection: noop,
    resizeActivePane: noop,
    focusSearch: noop,
    focusExplorerSearch: noop,
    toggleSidebar: noop,
    toggleTabOrientation: noop,
    toggleTabsColumn: noop,
    toggleFocusMode: noop,
    toggleFullScreen: noop,
    toggleHiddenFiles: noop,
    openSettings: noop,
    openKeyboardShortcuts: noop,
    openSpacesOverview: noop,
    newSpace: noop,
    switchSpace: noop,
    ...over,
  };
}

function reasonById(over: Partial<CommandPaletteActionContext>, id: string) {
  const item = createCommandItems(baseContext(over)).find((i) => i.id === id);
  if (!item) throw new Error(`no command item ${id}`);
  return item.disabledReason;
}

describe('createCommandItems', () => {
  it('enables split on a terminal tab below the pane limit', () => {
    expect(reasonById({}, 'pane.splitRight')).toBeUndefined();
    expect(reasonById({}, 'pane.splitDown')).toBeUndefined();
  });

  it('disables split when there is no terminal tab', () => {
    const editorTab = { ...terminalTab(1), kind: 'editor' } as unknown as Tab;
    expect(reasonById({ tabs: [editorTab] }, 'pane.splitRight')).toBe('No terminal tab');
  });

  it.each([
    'pane.moveToNewTab',
    'pane.focusLeft',
    'pane.focusRight',
    'pane.focusUp',
    'pane.focusDown',
    'pane.resizeLeft',
    'pane.resizeRight',
    'pane.resizeUp',
    'pane.resizeDown',
  ])('offers %s only when the terminal tab has another pane', (id) => {
    const editorTab = { ...terminalTab(1), kind: 'editor' } as unknown as Tab;
    expect(reasonById({ tabs: [editorTab] }, id)).toBe('No terminal tab');
    expect(reasonById({}, id)).toBe('Only pane');
    const split = {
      ...terminalTab(1),
      paneTree: {
        kind: 'split',
        id: 5,
        dir: 'row',
        ratios: [0.5, 0.5],
        children: [
          { kind: 'leaf', id: 10 },
          { kind: 'leaf', id: 11 },
        ],
      },
    } as unknown as Tab;
    expect(reasonById({ tabs: [split] }, id)).toBeUndefined();
  });

  it('runs the directional pane commands with their direction', () => {
    const focused: string[] = [];
    const resized: string[] = [];
    const items = createCommandItems(
      baseContext({
        focusPaneInDirection: (d) => focused.push(d),
        resizeActivePane: (d) => resized.push(d),
      }),
    );
    for (const id of ['pane.focusLeft', 'pane.focusDown', 'pane.resizeRight', 'pane.resizeUp']) {
      items.find((i) => i.id === id)?.run();
    }
    expect(focused).toEqual(['left', 'down']);
    expect(resized).toEqual(['right', 'up']);
    const titles = items.filter((i) => /^pane\.(focus|resize)[A-Z]/.test(i.id)).map((i) => i.title);
    expect(titles).toEqual([
      'Focus pane left',
      'Resize pane left',
      'Focus pane right',
      'Resize pane right',
      'Focus pane up',
      'Resize pane up',
      'Focus pane down',
      'Resize pane down',
    ]);
  });

  it('moves a pane to a neighbouring terminal tab only when there is one', () => {
    const tabs = [terminalTab(1), terminalTab(2)];
    expect(reasonById({ tabs, activeId: 1 }, 'pane.moveToNextTab')).toBeUndefined();
    expect(reasonById({ tabs, activeId: 1 }, 'pane.moveToPrevTab')).toBe('No terminal tab there');
  });

  it('disables close on the last tab with a single pane', () => {
    expect(reasonById({}, 'tab.close')).toBe('Last tab');
  });

  it('enables close when more than one tab is open', () => {
    expect(reasonById({ tabs: [terminalTab(1), terminalTab(2)] }, 'tab.close')).toBeUndefined();
  });

  it('disables content search when there is no searchable view', () => {
    expect(reasonById({ searchTarget: null as never }, 'search.focus')).toBe('No searchable view');
  });

  it('disables explorer search when there is no workspace root', () => {
    expect(reasonById({ explorerRoot: null }, 'explorer.search')).toBe('No workspace root');
  });

  it('marks the active space as the current one', () => {
    const reason = reasonById(
      { spaces: [{ id: 'sp1', name: 'One' }], activeSpaceId: 'sp1' },
      'spaces.switch.sp1',
    );
    expect(reason).toBe('Current space');
  });
});
