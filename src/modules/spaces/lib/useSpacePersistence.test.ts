import { describe, expect, it, vi } from 'vitest';

vi.mock('./store', () => ({ saveState: vi.fn() }));

const { freshTerminalTab } = await import('./serialize');
const { spaceWrites } = await import('./useSpacePersistence');
type LastWrite = import('./useSpacePersistence').LastWrite;

let next = 0;
const allocId = () => ++next;
const tab = (spaceId: string, cwd: string) => freshTerminalTab(spaceId, cwd, allocId);

describe('spaceWrites', () => {
  it('never writes the ephemeral Space (E16-15)', () => {
    const tabs = [tab('ephemeral', 'C:/e'), tab('a', 'C:/a')];
    const writes = spaceWrites(
      { tabs, activeId: tabs[0].id, activeSpaceId: 'ephemeral' },
      ['ephemeral', 'a'],
      new Map(),
    );
    expect(writes.map((w) => w.spaceId)).toEqual(['a']);
  });

  it('drops a tab moved into the ephemeral Space from its old Space, also its last one', () => {
    const last = new Map<string, LastWrite>();
    const moved = tab('a', 'C:/a');
    spaceWrites(
      { tabs: [moved], activeId: moved.id, activeSpaceId: 'a' },
      ['ephemeral', 'a'],
      last,
    );

    const tabs = [{ ...moved, spaceId: 'ephemeral' }];
    const writes = spaceWrites(
      { tabs, activeId: moved.id, activeSpaceId: 'ephemeral' },
      ['ephemeral', 'a'],
      last,
    );
    expect(writes).toEqual([{ spaceId: 'a', state: { tabs: [], activeTabIndex: 0 } }]);
  });

  it('saves a tab moved out of the ephemeral Space with its new Space', () => {
    const last = new Map<string, LastWrite>();
    const kept = tab('a', 'C:/a');
    const moved = tab('ephemeral', 'C:/e');
    spaceWrites(
      { tabs: [kept, moved], activeId: kept.id, activeSpaceId: 'a' },
      ['ephemeral', 'a'],
      last,
    );

    const tabs = [kept, { ...moved, spaceId: 'a' }];
    const writes = spaceWrites(
      { tabs, activeId: moved.id, activeSpaceId: 'a' },
      ['ephemeral', 'a'],
      last,
    );
    expect(writes).toHaveLength(1);
    expect(writes[0].state.tabs).toHaveLength(2);
    expect(writes[0].state.activeTabIndex).toBe(1);
  });

  it('writes nothing for a Space that never had saved tabs, nor twice for the same tabs', () => {
    const last = new Map<string, LastWrite>();
    const only = tab('a', 'C:/a');
    const snap = { tabs: [only], activeId: only.id, activeSpaceId: 'a' };
    expect(spaceWrites(snap, ['a', 'b'], last).map((w) => w.spaceId)).toEqual(['a']);
    expect(spaceWrites(snap, ['a', 'b'], last)).toEqual([]);
  });
});
