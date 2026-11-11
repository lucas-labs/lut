import { leafIds } from '@/modules/terminal/lib/panes';
import { beforeEach, describe, expect, it } from 'vitest';
import { initialNavigationData, useNavigationStore } from './store';
import type { TerminalTab } from './types';

const store = () => useNavigationStore.getState();
const tab = (id: number) => store().tabs.find((t) => t.id === id) as TerminalTab | undefined;
const leaves = (id: number) => {
  const t = tab(id);
  return t ? leafIds(t.paneTree) : [];
};

beforeEach(() => {
  useNavigationStore.setState(initialNavigationData());
  store().markBooted();
});

describe('movePane', () => {
  it('moves a pane to a new tab right after its own and focuses it', () => {
    const moved = store().splitActivePane(1, 'row');
    if (moved === null) throw new Error('Expected a split');
    const other = store().newTab();
    const landed = store().movePane(moved, 'new');
    if (landed === null) throw new Error('Expected a move');
    expect(store().tabs.map((t) => t.id)).toEqual([1, landed, other]);
    expect(leaves(1)).toEqual([2]);
    expect(tab(1)?.activeLeafId).toBe(2);
    expect(tab(landed)).toMatchObject({
      paneTree: { kind: 'leaf', id: moved },
      activeLeafId: moved,
    });
    expect(store().activeId).toBe(landed);
  });

  it('moves a pane into another tab and closes the emptied source', () => {
    const target = store().newTab();
    const landed = store().movePane(2, target);
    expect(landed).toBe(target);
    expect(tab(1)).toBeUndefined();
    expect(leaves(target)).toHaveLength(2);
    expect(leaves(target)).toContain(2);
    expect(tab(target)?.activeLeafId).toBe(2);
    expect(store().activeId).toBe(target);
  });

  it('refuses a lone pane to a new tab, a full target and another space', () => {
    expect(store().movePane(2, 'new')).toBeNull();

    const full = store().newTab();
    store().splitActivePane(full, 'row');
    store().splitActivePane(full, 'row');
    store().splitActivePane(full, 'row');
    expect(store().movePane(2, full)).toBeNull();

    const elsewhere = store().newTabInSpace('other');
    expect(store().movePane(2, elsewhere)).toBeNull();
    expect(leaves(1)).toEqual([2]);
  });
});
