import { describe, expect, it } from 'vitest';
import { selectNavigatorItems } from './navigator';
import type { Tab } from './types';

const tabs: Tab[] = [
  {
    id: 1,
    kind: 'terminal',
    spaceId: 'a',
    title: 'shell',
    cwd: '/home/me/lut',
    paneTree: { kind: 'leaf', id: 2 },
    activeLeafId: 2,
    private: true,
  },
  {
    id: 3,
    kind: 'editor',
    spaceId: 'a',
    title: 'main.rs',
    path: '/home/me/lut/src/main.rs',
    dirty: true,
    preview: true,
    color: 'cyan',
  },
  { id: 4, kind: 'preview', spaceId: 'b', title: 'localhost', url: 'http://localhost' },
];

describe('selectNavigatorItems', () => {
  it("returns the space's tabs in order with their indicators", () => {
    expect(selectNavigatorItems({ tabs, activeId: 3 }, 'a')).toEqual([
      {
        id: 1,
        kind: 'terminal',
        title: 'lut',
        detail: 'me/lut',
        active: false,
        preview: false,
        dirty: false,
        private: true,
        renamable: true,
        color: null,
      },
      {
        id: 3,
        kind: 'editor',
        title: 'main.rs',
        detail: 'src',
        active: true,
        preview: true,
        dirty: true,
        private: false,
        renamable: false,
        color: 'cyan',
      },
    ]);
  });

  it('leaves other spaces out', () => {
    expect(selectNavigatorItems({ tabs, activeId: 4 }, 'b').map((t) => t.id)).toEqual([4]);
  });

  it("names a terminal tab with its active pane's shell title when the policy allows it", () => {
    const titled: Tab[] = [
      {
        id: 1,
        kind: 'terminal',
        spaceId: 'a',
        title: 'shell',
        cwd: '/home/me/lut',
        paneTree: { kind: 'leaf', id: 2, profileId: 'p', shellTitle: 'vim' },
        activeLeafId: 2,
      },
    ];
    const state = { tabs: titled, activeId: 1 };
    expect(selectNavigatorItems(state, 'a', (id) => id === 'p')[0]?.title).toBe('vim');
    expect(selectNavigatorItems(state, 'a', () => false)[0]?.title).toBe('lut');
  });
});
