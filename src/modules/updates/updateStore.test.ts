// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  invoke: vi.fn(),
  prefs: { updatesEnabled: true, updateChannel: null as 'stable' | 'beta' | null },
  version: '0.10.0',
  closed: [] as number[],
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: fake.invoke }));
vi.mock('@tauri-apps/api/app', () => ({ getVersion: async () => fake.version }));
vi.mock('@tauri-apps/plugin-updater', () => ({
  Update: class {
    rid: number;
    version: string;
    constructor(metadata: { rid: number; version: string }) {
      this.rid = metadata.rid;
      this.version = metadata.version;
    }
    async close() {
      fake.closed.push(this.rid);
    }
  },
}));
vi.mock('@/modules/settings/preferences', () => ({
  usePreferencesStore: { getState: () => fake.prefs },
}));

const { clearLastCheck, useUpdateStore } = await import('./updateStore');

const metadata = (rid: number, version: string) => ({
  rid,
  version,
  currentVersion: '0.10.0',
  rawJson: {},
});

beforeEach(() => {
  fake.invoke.mockReset().mockResolvedValue(null);
  fake.prefs = { updatesEnabled: true, updateChannel: null };
  fake.version = '0.10.0';
  fake.closed = [];
  clearLastCheck();
  useUpdateStore.setState({ status: 'idle', update: null, error: null });
});

const check = (manual = false) => useUpdateStore.getState().checkForUpdates({ manual });

describe('checkForUpdates', () => {
  it('makes no request when updates are off, not even a manual one', async () => {
    fake.prefs.updatesEnabled = false;
    await check();
    await check(true);
    expect(fake.invoke).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().status).toBe('idle');
  });

  it('checks the installed version channel unless one was chosen', async () => {
    fake.version = '0.11.0-beta.1';
    await check();
    expect(fake.invoke).toHaveBeenLastCalledWith('updates_check', { channel: 'beta' });
    fake.prefs.updateChannel = 'stable';
    await check(true);
    expect(fake.invoke).toHaveBeenLastCalledWith('updates_check', { channel: 'stable' });
  });

  it('waits for the interval on its own, but checks now when asked', async () => {
    await check();
    await check();
    expect(fake.invoke).toHaveBeenCalledTimes(1);
    await check(true);
    expect(fake.invoke).toHaveBeenCalledTimes(2);
  });

  it('checks again on its own once the last check is cleared', async () => {
    await check();
    clearLastCheck();
    await check();
    expect(fake.invoke).toHaveBeenCalledTimes(2);
  });

  it('keeps a newer release and releases the one it replaces', async () => {
    fake.invoke.mockResolvedValueOnce(metadata(7, '0.10.1'));
    await check();
    expect(useUpdateStore.getState()).toMatchObject({
      status: 'available',
      update: { version: '0.10.1' },
    });
    fake.invoke.mockResolvedValueOnce(null);
    await check(true);
    expect(useUpdateStore.getState()).toMatchObject({ status: 'upToDate', update: null });
    expect(fake.closed).toEqual([7]);
  });

  it('reports a failed check', async () => {
    fake.invoke.mockRejectedValueOnce('offline');
    await check();
    expect(useUpdateStore.getState()).toMatchObject({ status: 'error', error: 'offline' });
  });
});
