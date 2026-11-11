import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialNavigationData, useNavigationStore } from './store';

const dispose = vi.hoisted(() => vi.fn());

vi.mock('@/modules/terminal/lib/terminalSessionApi', () => ({
  disposeSession: dispose,
}));

const store = () => useNavigationStore.getState();

beforeEach(() => {
  useNavigationStore.setState(initialNavigationData());
  dispose.mockClear();
});

describe('tab actions in a row, before React renders', () => {
  it('keeps a new tab when closing its predecessor', () => {
    const created = store().newTab();
    store().closeTab(1);
    expect(dispose).toHaveBeenCalledExactlyOnceWith(2);
    expect(store().tabs.map((tab) => tab.id)).toEqual([created]);
    expect(store().activeId).toBe(created);
  });

  it('keeps unplanned additions during a multi-tab close', () => {
    const closing = store().newTab();
    const surviving = store().newTab();
    store().closeTabs(1, { closeIds: [closing], nextActiveId: 1 });
    expect(store().tabs.map((tab) => tab.id)).toEqual([1, surviving]);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('returns a split leaf immediately and disposes it once on close', () => {
    const leaf = store().splitActivePane(1, 'row');
    expect(leaf).not.toBeNull();
    store().closeActivePane(1);
    expect(dispose).toHaveBeenCalledExactlyOnceWith(leaf);
    const tab = store().tabs[0];
    expect(tab.kind === 'terminal' && tab.paneTree).toEqual({
      kind: 'leaf',
      id: 2,
    });
  });

  it('disposes a removed split leaf only once across repeated close requests', () => {
    const leaf = store().splitActivePane(1, 'row');
    if (leaf === null) throw new Error('Expected split leaf');
    store().closePaneByLeaf(leaf);
    store().closePaneByLeaf(leaf);
    expect(dispose).toHaveBeenCalledExactlyOnceWith(leaf);
    expect(store().tabs).toHaveLength(1);
  });

  it('removes a space together with its newer terminal tabs', () => {
    const space = store().tabs[0].spaceId;
    store().newTab();
    store().removeTabsForSpace(space, 'replacement', '/next');
    expect(dispose.mock.calls.map(([id]) => id)).toEqual([2, 4]);
    expect(store().tabs).toHaveLength(1);
    expect(store().tabs[0]).toMatchObject({
      spaceId: 'replacement',
      cwd: '/next',
    });
  });
});
