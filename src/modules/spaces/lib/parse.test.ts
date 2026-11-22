import { ShapeError } from '@/lib/shape';
import type { Tab } from '@/modules/navigation';
import type { PaneNode } from '@/modules/terminal/lib/panes';
import { describe, expect, it } from 'vitest';
import { parseSpacesStore } from './parse';
import { hydrateTabs, type SerializedNode, serializeTabs } from './serialize';

type Entries = [string, unknown][];

let lastId = 0;
const nextId = () => ++lastId;

function space(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name: id.toUpperCase(),
    root: `/${id}`,
    env: { kind: 'local' },
    createdAt: 1,
    updatedAt: 2,
    ...over,
  };
}

function leaves(count: number): SerializedNode {
  return {
    kind: 'split',
    dir: 'row',
    children: Array.from({ length: count }, (_, i) => ({ kind: 'leaf', cwd: `/p${i}` })),
  };
}

const terminal = (tree: unknown) => ({ kind: 'terminal', tree });

function store(tabsOfA: unknown[], extra: Entries = []): Entries {
  return [
    ['spaces', [space('a'), space('b')]],
    ['activeId', 'a'],
    ['state:a', { tabs: tabsOfA, activeTabIndex: 0 }],
    ['state:b', { tabs: [terminal({ kind: 'leaf', cwd: '/b' })], activeTabIndex: 0 }],
    ...extra,
  ];
}

/** The field a store that fails validation is reported at. */
function failedAt(entries: Entries): string {
  try {
    parseSpacesStore(entries);
  } catch (error) {
    if (error instanceof ShapeError) return error.path;
    throw error;
  }
  throw new Error('the store was accepted');
}

describe('parseSpacesStore', () => {
  it('reads back what was saved, and the tabs hydrate', () => {
    const tree: PaneNode = {
      kind: 'split',
      id: 10,
      dir: 'col',
      ratios: [0.5, 0.5],
      children: [
        { kind: 'leaf', id: 11, cwd: '/a', profileId: 'pwsh' },
        { kind: 'leaf', id: 12, cwd: '/b' },
      ],
    };
    const tabs = serializeTabs([
      {
        id: 1,
        kind: 'terminal',
        spaceId: 'a',
        title: 't',
        paneTree: tree,
        activeLeafId: 12,
        customTitle: 'Server',
        color: 'red',
      },
      {
        id: 2,
        kind: 'editor',
        spaceId: 'a',
        title: 'x',
        path: '/a/x.ts',
        dirty: false,
        preview: false,
      },
      { id: 3, kind: 'preview', spaceId: 'a', title: 'p', url: 'http://localhost:3000' },
      { id: 4, kind: 'markdown', spaceId: 'a', title: 'm', path: '/a/README.md' },
    ] as Tab[]);
    const spaces = [
      space('a', { color: 3 }),
      space('b', { root: null, env: { kind: 'wsl', distro: 'Ubuntu' } }),
    ];
    const parsed = parseSpacesStore([
      ['spaces', spaces],
      ['activeId', 'b'],
      ['state:a', { tabs, activeTabIndex: 2 }],
    ]);

    expect(parsed.spaces).toEqual(spaces);
    expect(parsed.activeId).toBe('b');
    expect(parsed.states.get('a')).toEqual({ tabs, activeTabIndex: 2 });
    expect(parsed.states.has('b')).toBe(false);
    expect(parsed.brokenTabs).toEqual([]);
    const restored = hydrateTabs(parsed.states.get('a')?.tabs ?? [], 'a', nextId);
    expect(restored.map((t) => t.kind)).toEqual(['terminal', 'editor', 'preview', 'markdown']);
    expect(restored[0]).toMatchObject({ customTitle: 'Server', color: 'red', cwd: '/b' });
  });

  it('reads an empty store as no Spaces, as on the first run', () => {
    expect(parseSpacesStore([])).toEqual({
      spaces: [],
      activeId: null,
      states: new Map(),
      brokenTabs: [],
    });
  });

  it('names the field of a store that fails validation', () => {
    expect(failedAt([['spaces', { a: space('a') }]])).toBe('spaces');
    expect(failedAt([['spaces', [space('a'), space('b', { name: 7 })]]])).toBe('spaces[1].name');
    expect(failedAt([['spaces', [space('a', { env: { kind: 'ssh' } })]]])).toBe(
      'spaces[0].env.kind',
    );
    expect(failedAt([['spaces', [space('a'), space('a')]]])).toBe('spaces[1].id');
    expect(failedAt([['activeId', 4]])).toBe('activeId');
    expect(failedAt(store([], [['state:a', { tabs: {}, activeTabIndex: 0 }]]))).toBe(
      'state:a.tabs',
    );
    expect(failedAt(store([], [['state:a', { tabs: [], activeTabIndex: '0' }]]))).toBe(
      'state:a.activeTabIndex',
    );
  });

  it('skips and reports a broken tab, and restores the rest of its Space', () => {
    const good = terminal({ kind: 'leaf', cwd: '/a' });
    const parsed = parseSpacesStore(
      store([
        good,
        { kind: 'browser', url: 'x' },
        terminal({ kind: 'split', dir: 'diagonal', children: [] }),
        'not a tab',
        { kind: 'editor', path: '/a/x.ts' },
        terminal({ ...leaves(2), ratios: '0.5,0.5' }),
        terminal({ ...leaves(2), ratios: [0.5, 'half'] }),
      ]),
    );

    expect(parsed.states.get('a')?.tabs).toEqual([good, { kind: 'editor', path: '/a/x.ts' }]);
    expect(parsed.states.get('b')?.tabs).toHaveLength(1);
    expect(parsed.brokenTabs).toEqual([
      { spaceId: 'a', index: 1, reason: expect.stringMatching(/state:a\.tabs\[1\]\.kind$/) },
      { spaceId: 'a', index: 2, reason: expect.stringMatching(/state:a\.tabs\[2\]\.tree\.dir$/) },
      { spaceId: 'a', index: 3, reason: expect.stringMatching(/state:a\.tabs\[3\]$/) },
      { spaceId: 'a', index: 5, reason: expect.stringMatching(/tabs\[5\]\.tree\.ratios$/) },
      { spaceId: 'a', index: 6, reason: expect.stringMatching(/tabs\[6\]\.tree\.ratios\[1\]$/) },
    ]);
  });

  it('keeps a tab with 4 panes and skips one with 5, naming its pane count', () => {
    const parsed = parseSpacesStore(store([terminal(leaves(4)), terminal(leaves(5))]));

    expect(parsed.states.get('a')?.tabs).toEqual([terminal(leaves(4))]);
    expect(parsed.brokenTabs).toEqual([{ spaceId: 'a', index: 1, reason: '5 panes, more than 4' }]);
  });

  it('ignores fields and keys it does not know, and the state of a Space no longer listed', () => {
    const tab = { ...terminal({ kind: 'leaf', cwd: '/a', zoom: 2 }), blocks: true };
    const parsed = parseSpacesStore(
      store(
        [tab],
        [
          ['spaces', [space('a', { pinned: true }), space('b')]],
          ['state:gone', 'not a state'],
          ['windows', 3],
        ],
      ),
    );

    expect(parsed.spaces[0]).not.toHaveProperty('pinned');
    expect(parsed.states.get('a')?.tabs).toEqual([terminal({ kind: 'leaf', cwd: '/a' })]);
    expect(parsed.states.has('gone')).toBe(false);
    expect(parsed.brokenTabs).toEqual([]);
  });
});
