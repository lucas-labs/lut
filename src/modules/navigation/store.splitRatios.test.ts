import { beforeEach, describe, expect, it } from 'vitest';
import { initialNavigationData, useNavigationStore } from './store';
import type { TerminalTab } from './types';

const store = () => useNavigationStore.getState();
const tab = (id: number) => store().tabs.find((t) => t.id === id) as TerminalTab;

beforeEach(() => {
  useNavigationStore.setState(initialNavigationData());
  store().markBooted();
});

describe('split ratios in the store', () => {
  it('keeps a resized split across a tab switch and spreads a closed pane over the rest', () => {
    const second = store().splitActivePane(1, 'row');
    const third = store().splitActivePane(1, 'row');
    if (second === null || third === null) throw new Error('Expected splits');
    const splitId = tab(1).paneTree.id;
    store().setSplitRatios(1, splitId, [50, 30, 20]);

    const other = store().newTab();
    store().setActiveId(other);
    store().setActiveId(1);
    expect(tab(1).paneTree).toMatchObject({ ratios: [0.5, 0.3, 0.2] });

    store().closePaneByLeaf(2);
    const tree = tab(1).paneTree;
    if (tree.kind !== 'split') throw new Error('Expected a split');
    expect(tree.ratios[0]).toBeCloseTo(0.6);
    expect(tree.ratios[1]).toBeCloseTo(0.4);
  });

  it('leaves the tabs untouched when the ratios do not change', () => {
    store().splitActivePane(1, 'col');
    const before = store().tabs;
    store().setSplitRatios(1, tab(1).paneTree.id, [1, 1]);
    expect(store().tabs).toBe(before);
  });
  it('focuses the pane beside the active one and moves its divider', () => {
    const second = store().splitActivePane(1, 'row');
    if (second === null) throw new Error('Expected a split');
    const split = tab(1).paneTree;
    if (split.kind !== 'split') throw new Error('Expected a split');
    store().focusPaneInDirection(1, 'left');
    expect(tab(1).activeLeafId).toBe(split.children[0].id);
    const before = store().tabs;
    store().focusPaneInDirection(1, 'left');
    expect(store().tabs).toBe(before);

    store().resizeActivePaneInDirection(1, 'right');
    const tree = tab(1).paneTree;
    if (tree.kind !== 'split') throw new Error('Expected a split');
    expect(tree.ratios[0]).toBeCloseTo(0.55);
    expect(tree.ratios[1]).toBeCloseTo(0.45);
  });
});
