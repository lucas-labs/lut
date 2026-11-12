// @vitest-environment happy-dom
import { DEFAULT_SPACE_ID } from '@/modules/navigation';
import type { Tab } from '@/modules/tabs';
import { describe, expect, it, vi } from 'vitest';
import {
  type AppShortcutArgs,
  createAppShortcutHandlers,
  isAppShortcutDisabled,
} from './useAppShortcuts';

function terminalTab(leaves: number): Tab {
  const paneTree =
    leaves === 1
      ? { kind: 'leaf', id: 10 }
      : {
          kind: 'split',
          id: 5,
          dir: 'row',
          ratios: Array.from({ length: leaves }, () => 1 / leaves),
          children: Array.from({ length: leaves }, (_, i) => ({ kind: 'leaf', id: 10 + i })),
        };
  return {
    id: 1,
    kind: 'terminal',
    spaceId: 's',
    title: 'shell',
    paneTree,
    activeLeafId: 10,
  } as unknown as Tab;
}

const editorTab = { id: 2, kind: 'editor', spaceId: 's', title: 'a.ts' } as unknown as Tab;

function args(over: Partial<AppShortcutArgs> = {}): AppShortcutArgs {
  return {
    activeId: 1,
    activeSpaceId: 'space-a',
    activeTab: terminalTab(1),
    editorRefs: { current: new Map() },
    focusSearchInline: () => {},
    openCommandPalette: vi.fn(),
    openNewTab: vi.fn(),
    openNewPrivateTab: vi.fn(),
    openPreviewTab: vi.fn(),
    setNewEditorOpen: vi.fn(),
    handleCloseTabOrPane: vi.fn(),
    stepSwitcher: vi.fn(),
    selectByIndex: vi.fn(),
    cycleSpace: vi.fn(),
    openSidebarView: vi.fn(),
    splitActivePaneInActiveTab: vi.fn(),
    focusNextPaneInTab: vi.fn(),
    swapActivePane: vi.fn(),
    moveActivePane: vi.fn(),
    toggleSourceControl: vi.fn(),
    activateAgentTarget: vi.fn(),
    toggleSidebar: vi.fn(),
    toggleExplorerFocus: vi.fn(),
    toggleHiddenFiles: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomReset: vi.fn(),
    toggleFocusMode: vi.fn(),
    toggleFullScreen: vi.fn(),
    toggleTabOrientation: vi.fn(),
    toggleTabsColumn: vi.fn(),
    ...over,
  };
}

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('createAppShortcutHandlers', () => {
  it('maps the tab shortcuts to the tab actions', () => {
    const a = args();
    const h = createAppShortcutHandlers(a);
    const e = key({});
    h['tab.new']?.(e);
    h['tab.newPrivate']?.(e);
    h['tab.newPreview']?.(e);
    h['tab.newEditor']?.(e);
    h['tab.close']?.(e);
    h['tab.next']?.(e);
    h['tab.prev']?.(e);
    expect(a.openNewTab).toHaveBeenCalledOnce();
    expect(a.openNewPrivateTab).toHaveBeenCalledOnce();
    expect(a.openPreviewTab).toHaveBeenCalledWith('');
    expect(a.setNewEditorOpen).toHaveBeenCalledWith(true);
    expect(a.handleCloseTabOrPane).toHaveBeenCalledOnce();
    expect(a.stepSwitcher).toHaveBeenNthCalledWith(1, 1);
    expect(a.stepSwitcher).toHaveBeenNthCalledWith(2, -1);
  });

  it('selects a tab by its digit in the active space, or the default space', () => {
    const a = args();
    createAppShortcutHandlers(a)['tab.selectByIndex']?.(
      key({ key: '3', code: 'Digit3', ctrlKey: true }),
    );
    expect(a.selectByIndex).toHaveBeenCalledWith(2, 'space-a');

    const none = args({ activeSpaceId: null });
    createAppShortcutHandlers(none)['tab.selectByIndex']?.(
      key({ key: '1', code: 'Digit1', ctrlKey: true }),
    );
    expect(none.selectByIndex).toHaveBeenCalledWith(0, DEFAULT_SPACE_ID);
  });

  it('maps the pane shortcuts to the pane actions on the active tab', () => {
    const a = args({ activeId: 7 });
    const h = createAppShortcutHandlers(a);
    const e = key({});
    for (const id of [
      'pane.splitRight',
      'pane.splitDown',
      'pane.focusNext',
      'pane.focusPrev',
      'pane.swapLeft',
      'pane.swapRight',
      'pane.swapUp',
      'pane.swapDown',
      'pane.moveToNewTab',
      'pane.moveToNextTab',
      'pane.moveToPrevTab',
    ] as const) {
      h[id]?.(e);
    }
    expect(vi.mocked(a.splitActivePaneInActiveTab).mock.calls).toEqual([['row'], ['col']]);
    expect(vi.mocked(a.focusNextPaneInTab).mock.calls).toEqual([
      [7, 1],
      [7, -1],
    ]);
    expect(vi.mocked(a.swapActivePane).mock.calls).toEqual([['left'], ['right'], ['up'], ['down']]);
    expect(vi.mocked(a.moveActivePane).mock.calls).toEqual([['new'], [1], [-1]]);
  });
});

describe('isAppShortcutDisabled', () => {
  const e = key({});

  it('turns pane swaps off with a single pane and on with two', () => {
    expect(isAppShortcutDisabled('pane.swapLeft', e, terminalTab(1))).toBe(true);
    expect(isAppShortcutDisabled('pane.swapLeft', e, terminalTab(2))).toBe(false);
  });

  it('keeps the editor shortcuts to editor tabs', () => {
    expect(isAppShortcutDisabled('editor.save', e, terminalTab(1))).toBe(true);
    expect(isAppShortcutDisabled('editor.save', e, editorTab)).toBe(false);
  });

  it('leaves plain Ctrl+B to a focused terminal, but not Ctrl+Shift+B', () => {
    const terminal = document.createElement('div');
    terminal.dataset.lutTerminalSurface = '';
    document.body.append(terminal);
    const plain = key({ key: 'b', ctrlKey: true });
    const shifted = key({ key: 'B', ctrlKey: true, shiftKey: true });
    terminal.dispatchEvent(plain);
    terminal.dispatchEvent(shifted);
    expect(isAppShortcutDisabled('sidebar.toggle', plain, terminalTab(1))).toBe(true);
    expect(isAppShortcutDisabled('sidebar.toggle', shifted, terminalTab(1))).toBe(false);
    expect(
      isAppShortcutDisabled('sidebar.toggle', key({ key: 'b', ctrlKey: true }), terminalTab(1)),
    ).toBe(false);
    terminal.remove();
  });
});
