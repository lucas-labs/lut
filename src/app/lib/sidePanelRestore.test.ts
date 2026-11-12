import type { Layout } from 'react-resizable-panels';
import { describe, expect, it } from 'vitest';
import {
  foldSideLayoutChange,
  settledLayout,
  type SideLayoutChange,
  sideLayoutChange,
} from './sidePanelRestore';

const SIDE = ['sidebar', 'tabs-column'] as const;
const vertical = { sidebar: 20, 'tabs-column': 15, workspace: 65 };
// A 1000px group: a percentage is ten pixels.
const px = (layout: Layout) => (id: string) => Math.round((layout[id] ?? 0) * 10);

describe('sideLayoutChange', () => {
  const restored = (prev: Layout | null, next: Layout, user = false) =>
    sideLayoutChange(prev, next, user, SIDE).restore;

  it('never undoes a drag', () => {
    expect(restored(vertical, { sidebar: 0, 'tabs-column': 35, workspace: 65 }, true)).toEqual([]);
  });

  it('leaves the first layout alone', () => {
    expect(restored(null, vertical)).toEqual([]);
  });

  it('puts every side panel back when the tab column goes or comes', () => {
    const horizontal = { sidebar: 0, workspace: 100 };
    expect(restored(vertical, horizontal)).toEqual(['sidebar']);
    expect(restored(horizontal, vertical)).toEqual(['sidebar', 'tabs-column']);
  });

  it('puts both back when focus mode ends', () => {
    expect(restored({ workspace: 100 }, vertical)).toEqual(['sidebar', 'tabs-column']);
  });

  it('keeps the tab column at its width when the sidebar opens or closes', () => {
    const closed = { sidebar: 0, 'tabs-column': 35, workspace: 65 };
    expect(sideLayoutChange(vertical, closed, false, SIDE)).toEqual({
      changed: ['sidebar'],
      restore: ['tabs-column'],
    });
    expect(restored(closed, vertical)).toEqual(['tabs-column']);
  });

  it('reopens the tab column when the sidebar squeezed it shut while opening', () => {
    const before = { sidebar: 0, 'tabs-column': 22, workspace: 78 };
    const after = { sidebar: 22, 'tabs-column': 0, workspace: 78 };
    expect(sideLayoutChange(before, after, false, SIDE)).toEqual({
      changed: ['sidebar'],
      restore: ['tabs-column'],
    });
  });

  it('keeps the sidebar at its width when the tab column opens or closes', () => {
    const closed = { sidebar: 20, 'tabs-column': 0, workspace: 80 };
    expect(restored(vertical, closed)).toEqual(['sidebar']);
  });

  it('does nothing for a layout that only changed size', () => {
    expect(restored(vertical, { sidebar: 18, 'tabs-column': 13, workspace: 69 })).toEqual([]);
  });
});

describe('foldSideLayoutChange', () => {
  const fold = (
    targets: Record<string, number>,
    prev: Layout,
    next: Layout,
    own: Record<string, number> = { sidebar: 200, 'tabs-column': 150 },
  ): Record<string, number> =>
    foldSideLayoutChange(
      targets,
      sideLayoutChange(prev, next, false, SIDE),
      px(next),
      (id) => own[id] ?? 0,
    );

  it('keeps both closed when one command closes the sidebar and then the column', () => {
    const sidebarClosed = { sidebar: 0, 'tabs-column': 35, workspace: 65 };
    const bothClosed = { sidebar: 0, 'tabs-column': 0, workspace: 100 };
    const afterSidebar = fold({}, vertical, sidebarClosed);
    expect(afterSidebar).toEqual({ sidebar: 0, 'tabs-column': 150 });
    expect(fold(afterSidebar, sidebarClosed, bothClosed)).toEqual({ sidebar: 0, 'tabs-column': 0 });
  });

  it('keeps a panel opened on purpose open when a later change in the batch squeezes it', () => {
    const closed = { sidebar: 0, 'tabs-column': 0, workspace: 100 };
    const columnOpen = { sidebar: 0, 'tabs-column': 15, workspace: 85 };
    const sidebarOpen = { sidebar: 20, 'tabs-column': 0, workspace: 80 };
    // Both closed: their own widths are 0.
    const own = { sidebar: 0, 'tabs-column': 0 };
    const afterColumn = fold({}, closed, columnOpen, own);
    expect(afterColumn).toEqual({ sidebar: 0, 'tabs-column': 150 });
    expect(fold(afterColumn, columnOpen, sidebarOpen, own)).toEqual({
      sidebar: 200,
      'tabs-column': 150,
    });
  });

  it('restores the side panels from their own widths when the panel set changes', () => {
    const horizontal = { sidebar: 0, workspace: 100 };
    expect(fold({}, horizontal, vertical)).toEqual({ sidebar: 200, 'tabs-column': 150 });
  });

  it('adds nothing for a change that moved no side panel', () => {
    const none: SideLayoutChange = { changed: [], restore: [] };
    expect(foldSideLayoutChange({ sidebar: 0 }, none, px(vertical), () => 99)).toEqual({
      sidebar: 0,
    });
  });
});

describe('settledLayout', () => {
  it('moves only the panels away from their target, and the workspace takes the difference', () => {
    const layout = { sidebar: 20, 'tabs-column': 0, workspace: 80 };
    expect(settledLayout({ sidebar: 200, 'tabs-column': 150 }, layout, 1000, 'workspace')).toEqual({
      sidebar: 20,
      'tabs-column': 15,
      workspace: 65,
    });
  });

  it('closes an open panel whose target is closed', () => {
    const layout = { sidebar: 20, workspace: 80 };
    expect(settledLayout({ sidebar: 0 }, layout, 1000, 'workspace')).toEqual({
      sidebar: 0,
      workspace: 100,
    });
  });

  it('keeps a panel already at its target where it is while a panel beside it grows', () => {
    // Back to vertical tabs after a horizontal-mode drag widened the sidebar: the column must not pay for it.
    const layout = { sidebar: 22, 'tabs-column': 14, workspace: 64 };
    expect(settledLayout({ sidebar: 480, 'tabs-column': 140 }, layout, 1000, 'workspace')).toEqual({
      sidebar: 48,
      'tabs-column': 14,
      workspace: 38,
    });
  });

  it('needs nothing when the batch already ended where it should', () => {
    const layout = { sidebar: 0, 'tabs-column': 0, workspace: 100 };
    expect(settledLayout({ sidebar: 0, 'tabs-column': 0 }, layout, 1000, 'workspace')).toBeNull();
  });

  it('ignores a panel that is no longer in the group', () => {
    const layout = { sidebar: 0, workspace: 100 };
    expect(settledLayout({ 'tabs-column': 150 }, layout, 1000, 'workspace')).toBeNull();
  });

  it('needs the group laid out', () => {
    expect(
      settledLayout({ sidebar: 200 }, { sidebar: 0, workspace: 100 }, 0, 'workspace'),
    ).toBeNull();
  });
});
