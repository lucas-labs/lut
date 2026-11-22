import type { Tab } from '@/modules/navigation';
import type { PaneNode } from '@/modules/terminal/lib/panes';
import { describe, expect, it } from 'vitest';
import { hydrateTabs, type SerializedNode, type SerializedTab, serializeTabs } from './serialize';

function counter(start = 100): () => number {
  let n = start;
  return () => n++;
}

function leafIdsOf(node: PaneNode): number[] {
  return node.kind === 'leaf' ? [node.id] : node.children.flatMap(leafIdsOf);
}

function term(over: Partial<Extract<Tab, { kind: 'terminal' }>>): Tab {
  return {
    id: 1,
    kind: 'terminal',
    spaceId: 's1',
    title: 'shell',
    paneTree: { kind: 'leaf', id: 2, cwd: '/a' },
    activeLeafId: 2,
    ...over,
  } as Tab;
}

describe('serializeTabs', () => {
  it('drops private terminals and transient kinds', () => {
    const tabs: Tab[] = [
      term({ id: 1 }),
      term({ id: 3, private: true }),
      {
        id: 5,
        kind: 'git-diff',
        spaceId: 's1',
        title: 'd',
        path: '/a/x',
        repoRoot: '/a',
        mode: '+',
        originalPath: null,
        preview: true,
      },
      {
        id: 7,
        kind: 'editor',
        spaceId: 's1',
        title: 'x',
        path: '/a/x.ts',
        dirty: false,
        preview: false,
      },
    ];
    const out = serializeTabs(tabs);
    expect(out.map((t) => t.kind)).toEqual(['terminal', 'editor']);
  });

  it('marks the active leaf in a split tree', () => {
    const tree: PaneNode = {
      kind: 'split',
      id: 10,
      dir: 'row',
      ratios: [0.5, 0.5],
      children: [
        { kind: 'leaf', id: 11, cwd: '/a' },
        { kind: 'leaf', id: 12, cwd: '/b' },
      ],
    };
    const [s] = serializeTabs([term({ paneTree: tree, activeLeafId: 12 })]);
    const node = s as Extract<SerializedTab, { kind: 'terminal' }>;
    expect(node.tree.kind).toBe('split');
    if (node.tree.kind === 'split') {
      expect(node.tree.children[1]).toMatchObject({ cwd: '/b', active: true });
      expect(node.tree.children[0]).not.toHaveProperty('active');
    }
  });
});

describe('hydrateTabs', () => {
  it('round-trips structure, cwd and active leaf', () => {
    const tree: PaneNode = {
      kind: 'split',
      id: 10,
      dir: 'col',
      ratios: [0.5, 0.5],
      children: [
        { kind: 'leaf', id: 11, cwd: '/a' },
        { kind: 'leaf', id: 12, cwd: '/b' },
      ],
    };
    const tabs: Tab[] = [
      term({
        paneTree: tree,
        activeLeafId: 12,
        customTitle: 'x',
      }),
    ];
    const serialized = serializeTabs(tabs);
    const [restored] = hydrateTabs(serialized, 's2', counter());
    expect(restored.kind).toBe('terminal');
    if (restored.kind !== 'terminal') return;

    expect(restored.spaceId).toBe('s2');
    expect(restored.cold).toBe(true);
    expect(restored.customTitle).toBe('x');
    expect(restored.paneTree.kind).toBe('split');

    const leaves = leafIdsOf(restored.paneTree);
    expect(new Set(leaves).size).toBe(2);
    expect(leaves).toContain(restored.activeLeafId);
    // active leaf was the second one, which carried /b
    expect(restored.cwd).toBe('/b');
  });

  it('round-trips the profile and cwd of each pane, and a pane without a profile (E14-17)', () => {
    const tree: PaneNode = {
      kind: 'split',
      id: 10,
      dir: 'row',
      ratios: [1 / 3, 1 / 3, 1 / 3],
      children: [
        { kind: 'leaf', id: 11, cwd: 'C:\\work', profileId: 'detected:pwsh' },
        { kind: 'leaf', id: 12, cwd: '/home/me', profileId: 'detected:wsl:Ubuntu' },
        { kind: 'leaf', id: 13 },
      ],
    };
    const serialized = serializeTabs([term({ paneTree: tree, activeLeafId: 12 })]);
    const [restored] = hydrateTabs(JSON.parse(JSON.stringify(serialized)), 's1', counter());
    if (restored.kind !== 'terminal' || restored.paneTree.kind !== 'split') {
      throw new Error('Expected a restored split');
    }
    expect(
      restored.paneTree.children.map((leaf) =>
        leaf.kind === 'leaf' ? { cwd: leaf.cwd, profileId: leaf.profileId } : null,
      ),
    ).toEqual([
      { cwd: 'C:\\work', profileId: 'detected:pwsh' },
      { cwd: '/home/me', profileId: 'detected:wsl:Ubuntu' },
      { cwd: undefined, profileId: undefined },
    ]);
  });

  it('restores a tab persisted with the removed blocks flag as a plain terminal tab', () => {
    const [saved] = serializeTabs([term({})]);
    const legacy = { ...saved, blocks: true } as unknown as SerializedTab;
    const [restored] = hydrateTabs([legacy], 's1', counter());
    expect(restored.kind).toBe('terminal');
    expect(restored).not.toHaveProperty('blocks');
    expect(restored.title).not.toBe('blocks');
  });

  it('allocates fresh, unique, monotonic ids across all tabs and leaves', () => {
    const tree: PaneNode = {
      kind: 'split',
      id: 10,
      dir: 'row',
      ratios: [0.5, 0.5],
      children: [
        { kind: 'leaf', id: 11, cwd: '/a' },
        { kind: 'leaf', id: 12, cwd: '/b' },
      ],
    };
    const serialized = serializeTabs([
      term({ id: 1, paneTree: tree, activeLeafId: 11 }),
      term({ id: 2 }),
    ]);
    const restored = hydrateTabs(serialized, 's1', counter(100));

    const ids: number[] = [];
    for (const t of restored) {
      ids.push(t.id);
      if (t.kind === 'terminal') ids.push(...leafIdsOf(t.paneTree));
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.min(...ids)).toBeGreaterThanOrEqual(100);
  });

  it('hydrates editor/preview/markdown as cold with derived titles', () => {
    const serialized: SerializedTab[] = [
      { kind: 'editor', path: '/a/foo.ts' },
      { kind: 'preview', url: 'http://localhost:5173/x' },
      { kind: 'markdown', path: '/a/README.md' },
    ];
    const out = hydrateTabs(serialized, 's1', counter());
    expect(out.every((t) => t.cold === true)).toBe(true);
    expect(out.map((t) => t.title)).toEqual(['foo.ts', 'localhost:5173', 'README.md']);
  });
});

describe('tab colours', () => {
  it('keeps a terminal tab colour and an editor tab colour across a restore', () => {
    const editor: Tab = {
      id: 2,
      kind: 'editor',
      spaceId: 's1',
      title: 'notes.md',
      path: '/a/notes.md',
      dirty: false,
      preview: false,
      color: '#ff8800',
    };
    const serialized = serializeTabs([term({ color: 'cyan' }), editor]);
    expect(serialized.map((t) => t.color)).toEqual(['cyan', '#ff8800']);
    const restored = hydrateTabs(serialized, 's1', counter());
    expect(restored.map((t) => [t.kind, t.color])).toEqual([
      ['terminal', 'cyan'],
      ['editor', '#ff8800'],
    ]);
  });

  it('saves no colour for a tab without one, and does not keep the shell title', () => {
    const [serialized] = serializeTabs([
      term({ paneTree: { kind: 'leaf', id: 2, shellTitle: 'vim' }, activeLeafId: 2 }),
    ]);
    expect(serialized).not.toHaveProperty('color');
    expect(JSON.stringify(serialized)).not.toContain('vim');
  });
});

describe('split ratios (E16-05)', () => {
  function restoredTree(saved: SerializedNode): PaneNode {
    const tab = { kind: 'terminal', tree: saved } as const;
    const [restored] = hydrateTabs([tab], 's1', counter());
    if (restored.kind !== 'terminal') throw new Error('not a terminal');
    return restored.paneTree;
  }

  const ratiosOf = (node: PaneNode) => (node.kind === 'split' ? node.ratios : null);

  it('round-trips the ratios of nested splits with their topology and cwds', () => {
    const tree: PaneNode = {
      kind: 'split',
      id: 10,
      dir: 'row',
      ratios: [0.3, 0.7],
      children: [
        { kind: 'leaf', id: 11, cwd: '/a' },
        {
          kind: 'split',
          id: 12,
          dir: 'col',
          ratios: [0.25, 0.75],
          children: [
            { kind: 'leaf', id: 13, cwd: '/b' },
            { kind: 'leaf', id: 14, cwd: '/c' },
          ],
        },
      ],
    };
    const [saved] = serializeTabs([term({ paneTree: tree, activeLeafId: 11 })]);
    if (saved.kind !== 'terminal') throw new Error('not a terminal');
    const restored = restoredTree(saved.tree);

    expect(restored).toMatchObject({
      kind: 'split',
      dir: 'row',
      children: [
        { kind: 'leaf', cwd: '/a' },
        {
          kind: 'split',
          dir: 'col',
          children: [
            { kind: 'leaf', cwd: '/b' },
            { kind: 'leaf', cwd: '/c' },
          ],
        },
      ],
    });
    expect(ratiosOf(restored)).toEqual([0.3, 0.7]);
    if (restored.kind === 'split') expect(ratiosOf(restored.children[1])).toEqual([0.25, 0.75]);
  });

  it('normalises saved ratios that do not sum 1', () => {
    const leaves = [
      { kind: 'leaf', cwd: '/a' },
      { kind: 'leaf', cwd: '/b' },
    ] as const;
    const restored = restoredTree({
      kind: 'split',
      dir: 'row',
      children: [...leaves],
      ratios: [1, 3],
    });
    expect(ratiosOf(restored)).toEqual([0.25, 0.75]);
  });

  it('gives equal shares for missing ratios, the wrong length or a non-positive share', () => {
    const leaves = [
      { kind: 'leaf', cwd: '/a' },
      { kind: 'leaf', cwd: '/b' },
    ] as const;
    for (const ratios of [undefined, [1], [0.5, 0.25, 0.25], [1, 0], [-1, 2]]) {
      const restored = restoredTree({ kind: 'split', dir: 'row', children: [...leaves], ratios });
      expect(ratiosOf(restored)).toEqual([0.5, 0.5]);
    }
  });
});
