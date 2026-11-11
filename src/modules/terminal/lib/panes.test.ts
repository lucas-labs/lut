import {
  canAddPane,
  firstLeafSlotId,
  leafIds,
  normaliseRatios,
  type PaneNode,
  removeLeaf,
  setSplitRatios,
  splitLeaf,
  swapLeafInDirection,
} from '@/modules/terminal/lib/panes';
import { describe, expect, it } from 'vitest';

function row(...ids: number[]): PaneNode {
  return {
    kind: 'split',
    id: 100,
    dir: 'row',
    ratios: ids.map(() => 1 / ids.length),
    children: ids.map((id) => ({ kind: 'leaf', id })),
  };
}

function col(...ids: number[]): PaneNode {
  return {
    kind: 'split',
    id: 200,
    dir: 'col',
    ratios: ids.map(() => 1 / ids.length),
    children: ids.map((id) => ({ kind: 'leaf', id })),
  };
}

describe('swapLeafInDirection', () => {
  it('swaps the active pane with its neighbor to the left', () => {
    expect(leafIds(swapLeafInDirection(row(1, 2, 3), 2, 'left'))).toEqual([2, 1, 3]);
  });

  it('wraps right from the rightmost pane to the leftmost pane', () => {
    expect(leafIds(swapLeafInDirection(row(1, 2, 3), 3, 'right'))).toEqual([3, 2, 1]);
  });

  it('swaps vertically and wraps upward', () => {
    expect(leafIds(swapLeafInDirection(col(1, 2, 3), 2, 'down'))).toEqual([1, 3, 2]);
    expect(leafIds(swapLeafInDirection(col(1, 2, 3), 1, 'up'))).toEqual([3, 2, 1]);
  });

  it('chooses the overlapping directional neighbor in a nested layout', () => {
    const tree: PaneNode = {
      kind: 'split',
      id: 10,
      dir: 'row',
      ratios: [0.5, 0.5],
      children: [
        { kind: 'leaf', id: 1 },
        {
          kind: 'split',
          id: 11,
          dir: 'col',
          ratios: [0.5, 0.5],
          children: [
            { kind: 'leaf', id: 2 },
            { kind: 'leaf', id: 3 },
          ],
        },
      ],
    };

    expect(leafIds(swapLeafInDirection(tree, 2, 'down'))).toEqual([1, 3, 2]);
    expect(leafIds(swapLeafInDirection(tree, 3, 'left'))).toEqual([3, 2, 1]);
  });

  it('uses live pane bounds after splitters are resized', () => {
    const bounds = [
      { id: 1, left: 0, right: 100, top: 0, bottom: 100 },
      { id: 2, left: 200, right: 300, top: 100, bottom: 200 },
      { id: 3, left: 100, right: 200, top: 0, bottom: 100 },
    ];

    expect(leafIds(swapLeafInDirection(row(1, 2, 3), 1, 'right', bounds))).toEqual([3, 2, 1]);
  });

  it('falls back to tree geometry when live bounds are incomplete', () => {
    const tree = row(1, 2, 3);
    const incompleteBounds = [{ id: 1, left: 0, right: 100, top: 0, bottom: 100 }];

    expect(leafIds(swapLeafInDirection(tree, 1, 'right', incompleteBounds))).toEqual([2, 1, 3]);
  });

  it('moves pane metadata with the terminal session', () => {
    const tree: PaneNode = {
      kind: 'split',
      id: 100,
      dir: 'row',
      ratios: [0.5, 0.5],
      children: [
        { kind: 'leaf', id: 1, cwd: '/one' },
        { kind: 'leaf', id: 2, cwd: '/two' },
      ],
    };
    const swapped = swapLeafInDirection(tree, 2, 'left');
    expect(swapped.kind).toBe('split');
    if (swapped.kind === 'split') {
      expect(swapped.children[0]).toEqual({
        kind: 'leaf',
        id: 2,
        slotId: 1,
        cwd: '/two',
      });
      expect(swapped.children[1]).toEqual({
        kind: 'leaf',
        id: 1,
        slotId: 2,
        cwd: '/one',
      });
    }
  });

  it('keeps resizable layout slots fixed while sessions move', () => {
    const tree = row(1, 2, 3);
    const swapped = swapLeafInDirection(tree, 2, 'left');

    expect(swapped.kind).toBe('split');
    if (swapped.kind === 'split') {
      expect(swapped.children.map(firstLeafSlotId)).toEqual([1, 2, 3]);
      expect(leafIds(swapped)).toEqual([2, 1, 3]);
    }

    const restored = swapLeafInDirection(swapped, 2, 'right');
    expect(restored.kind).toBe('split');
    if (restored.kind === 'split') {
      expect(restored.children.map(firstLeafSlotId)).toEqual([1, 2, 3]);
      expect(leafIds(restored)).toEqual([1, 2, 3]);
    }
  });

  it('does nothing when the tree contains only one pane', () => {
    const tree: PaneNode = { kind: 'leaf', id: 1 };
    expect(swapLeafInDirection(tree, 1, 'left')).toBe(tree);
  });
});

describe('split ratios', () => {
  const leaf = (id: number): PaneNode => ({ kind: 'leaf', id });
  const sum = (ratios: number[]) => ratios.reduce((a, b) => a + b, 0);
  const withRatios = (tree: PaneNode, ratios: number[]): PaneNode =>
    tree.kind === 'split' ? { ...tree, ratios } : tree;

  it('gives a new split two equal shares and keeps the existing ids', () => {
    const tree = splitLeaf(leaf(1), 1, 10, 2, 'row');
    expect(tree).toEqual({
      kind: 'split',
      id: 10,
      dir: 'row',
      children: [leaf(1), { kind: 'leaf', id: 2, cwd: undefined }],
      ratios: [0.5, 0.5],
    });
  });

  it("halves the target's share when appending to a same-direction split", () => {
    const tree: PaneNode = withRatios(row(1, 2), [0.7, 0.3]);
    const next = splitLeaf(tree, 1, 99, 3, 'row');
    expect(next.kind === 'split' && next.id).toBe(100);
    expect(leafIds(next)).toEqual([1, 3, 2]);
    expect(next.kind === 'split' && next.ratios).toEqual([0.35, 0.35, 0.3]);
  });

  it('nests a split of the other direction without touching the outer shares', () => {
    const tree: PaneNode = withRatios(row(1, 2), [0.7, 0.3]);
    const next = splitLeaf(tree, 2, 50, 3, 'col');
    expect(next.kind === 'split' && next.ratios).toEqual([0.7, 0.3]);
    expect(next.kind === 'split' && next.children[1]).toMatchObject({
      kind: 'split',
      id: 50,
      dir: 'col',
      ratios: [0.5, 0.5],
    });
  });

  it("gives a removed pane's share to the rest in proportion", () => {
    const tree: PaneNode = withRatios(row(1, 2, 3), [0.5, 0.3, 0.2]);
    const next = removeLeaf(tree, 1);
    if (next?.kind !== 'split') throw new Error('Expected a split');
    expect(next.id).toBe(100);
    expect(next.ratios[0]).toBeCloseTo(0.6);
    expect(next.ratios[1]).toBeCloseTo(0.4);
    expect(sum(next.ratios)).toBeCloseTo(1);
  });

  it('collapses a split left with one pane and returns the tree untouched for unknown ids', () => {
    const tree = row(1, 2);
    expect(removeLeaf(tree, 2)).toEqual(leaf(1));
    expect(removeLeaf(tree, 42)).toBe(tree);
  });

  it('keeps ratios when panes swap', () => {
    const tree: PaneNode = withRatios(row(1, 2), [0.7, 0.3]);
    const swapped = swapLeafInDirection(tree, 2, 'left');
    expect(swapped.kind === 'split' && swapped.ratios).toEqual([0.7, 0.3]);
    expect(leafIds(swapped)).toEqual([2, 1]);
  });

  it('normalises ratios and falls back to equal shares for a bad list', () => {
    expect(normaliseRatios([2, 2], 2)).toEqual([0.5, 0.5]);
    expect(normaliseRatios([1], 2)).toEqual([0.5, 0.5]);
    expect(normaliseRatios([1, 0], 2)).toEqual([0.5, 0.5]);
    expect(normaliseRatios([1, Number.NaN], 2)).toEqual([0.5, 0.5]);
  });

  it('sets one split by id and leaves the tree as is when nothing changes', () => {
    const tree: PaneNode = {
      kind: 'split',
      id: 100,
      dir: 'row',
      children: [leaf(1), col(2, 3)],
      ratios: [0.5, 0.5],
    };
    const next = setSplitRatios(tree, 200, [3, 1]);
    expect(next.kind === 'split' && next.children[1]).toMatchObject({ ratios: [0.75, 0.25] });
    expect(setSplitRatios(next, 200, [0.75, 0.25])).toBe(next);
  });

  it('caps a tab at four panes', () => {
    expect(canAddPane(row(1, 2, 3))).toBe(true);
    expect(canAddPane(row(1, 2, 3, 4))).toBe(false);
  });
});
