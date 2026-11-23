import { beforeEach, describe, expect, it, vi } from 'vitest';

// The store and its write guard live at module level, so each test imports a fresh copy, after the mocks.
const disk = vi.hoisted(() => ({
  entries: [] as [string, unknown][],
  calls: [] as string[],
  values: new Map<string, unknown>(),
}));
const native = vi.hoisted(() => ({
  open: null as { backupPath: string; reason: string } | null,
  moveAside: { backupPath: '/data/lut-spaces.corrupt-1.json', reason: '' },
  copyAside: { backupPath: '/data/lut-spaces.corrupt-3.json', reason: '' },
}));

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    entries = async () => {
      disk.calls.push('entries');
      return disk.entries;
    };
    set = async (key: string, value: unknown) => {
      disk.calls.push(`set ${key}`);
      disk.values.set(key, value);
    };
    delete = async (key: string) => void disk.calls.push(`delete ${key}`);
    clear = async () => void disk.calls.push('clear');
    save = async () => void disk.calls.push('save');
  },
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args?: { reason: string }) => {
    disk.calls.push(command);
    if (command === 'spaces_store_open') return native.open;
    const result = command === 'spaces_store_copy_aside' ? native.copyAside : native.moveAside;
    return { ...result, reason: args?.reason };
  },
}));

const loadStore = () => import('./store');

const space = {
  id: 'a',
  name: 'A',
  root: null,
  env: { kind: 'local' as const },
  createdAt: 1,
  updatedAt: 1,
};

async function writeEverything(store: Awaited<ReturnType<typeof loadStore>>) {
  disk.calls = [];
  await store.saveSpacesList([]);
  await store.saveActiveId('a');
  await store.saveState('a', { tabs: [], activeTabIndex: 0 });
  await store.deleteSpaceData('a');
  return disk.calls;
}

beforeEach(() => {
  vi.resetModules();
  disk.entries = [];
  disk.calls = [];
  disk.values.clear();
  native.open = null;
  native.moveAside = { backupPath: '/data/lut-spaces.corrupt-1.json', reason: '' };
  native.copyAside = { backupPath: '/data/lut-spaces.corrupt-3.json', reason: '' };
});

describe('loadAll', () => {
  it('has native check the file before the store plugin reads it, and loads a valid store', async () => {
    disk.entries = [
      ['spaces', [space]],
      ['activeId', 'a'],
    ];
    const store = await loadStore();
    const load = await store.loadAll();

    expect(disk.calls).toEqual(['spaces_store_open', 'entries']);
    expect(load.data.spaces).toEqual([space]);
    expect(load.data.activeId).toBe('a');
    expect(load.recovered).toBeNull();
    expect(load.brokenTabsCopy).toBeNull();
    expect(await writeEverything(store)).toHaveLength(4);
  });

  it('keeps a copy of a file with broken tabs before saving over them', async () => {
    disk.entries = [
      ['spaces', [space]],
      ['state:a', { tabs: [{ kind: 'browser' }], activeTabIndex: 0 }],
    ];
    const store = await loadStore();
    const load = await store.loadAll();

    expect(disk.calls).toEqual(['spaces_store_open', 'entries', 'spaces_store_copy_aside']);
    expect(load.brokenTabs).toHaveLength(1);
    expect(load.brokenTabsCopy).toEqual({
      backupPath: '/data/lut-spaces.corrupt-3.json',
      reason: '1 saved tab could not be restored',
    });
    expect(await writeEverything(store)).toHaveLength(4);
  });

  it('saves nothing when a file with broken tabs could not be copied', async () => {
    disk.entries = [
      ['spaces', [space]],
      ['state:a', { tabs: [{ kind: 'browser' }], activeTabIndex: 0 }],
    ];
    native.copyAside = { backupPath: '', reason: '' };
    const store = await loadStore();
    const load = await store.loadAll();

    expect(load.brokenTabsCopy?.backupPath).toBe('');
    expect(await writeEverything(store)).toEqual([]);
  });

  it('moves a store of the wrong shape aside, empties it and loads the defaults', async () => {
    disk.entries = [['spaces', [{ ...space, name: 7 }]]];
    const store = await loadStore();
    const load = await store.loadAll();

    expect(disk.calls).toEqual([
      'spaces_store_open',
      'entries',
      'spaces_store_move_aside',
      'clear',
      'save',
    ]);
    expect(load.data).toEqual({ spaces: [], activeId: null, states: new Map() });
    expect(load.recovered).toEqual({
      backupPath: '/data/lut-spaces.corrupt-1.json',
      reason: 'Unexpected saved Spaces data at spaces[0].name',
    });
    expect(await writeEverything(store)).toHaveLength(4);
  });

  it('reports a file native moved aside, and saves the defaults over it', async () => {
    native.open = { backupPath: '/data/lut-spaces.corrupt-2.json', reason: 'EOF while parsing' };
    const store = await loadStore();
    const load = await store.loadAll();

    expect(load.data.spaces).toEqual([]);
    expect(load.recovered).toEqual(native.open);
    expect(await writeEverything(store)).toHaveLength(4);
  });

  it('saves nothing when the file could not be read and was left in place', async () => {
    native.open = { backupPath: '', reason: 'could not read lut-spaces.json: denied' };
    const store = await loadStore();
    const load = await store.loadAll();

    expect(load.recovered).toEqual(native.open);
    expect(await writeEverything(store)).toEqual([]);
  });

  it('saves nothing when a store of the wrong shape could not be moved aside', async () => {
    disk.entries = [['spaces', 'not a list']];
    native.moveAside = { backupPath: '', reason: '' };
    const store = await loadStore();
    const load = await store.loadAll();

    expect(disk.calls).not.toContain('clear');
    expect(load.recovered?.backupPath).toBe('');
    expect(load.data.spaces).toEqual([]);
    expect(await writeEverything(store)).toEqual([]);
  });
});

describe('the ephemeral Space (E16-15)', () => {
  const ephemeral = { ...space, id: 'ephemeral', name: 'Ephemeral' };

  it('is left out of the saved Space list', async () => {
    const store = await loadStore();
    await store.saveSpacesList([ephemeral, space]);
    expect(disk.values.get('spaces')).toEqual([space]);
  });

  it('is never saved as the active Space, its tabs nor its deletion', async () => {
    const store = await loadStore();
    disk.calls = [];
    await store.saveActiveId('ephemeral');
    await store.saveState('ephemeral', { tabs: [], activeTabIndex: 0 });
    await store.deleteSpaceData('ephemeral');
    expect(disk.calls).toEqual([]);
  });
});
