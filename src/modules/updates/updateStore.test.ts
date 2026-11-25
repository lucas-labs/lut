// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  invoke: vi.fn(),
  prefs: { updatesEnabled: true, updateChannel: null as 'stable' | 'beta' | null },
  version: '0.10.0',
  closed: [] as number[],
  download: vi.fn<(onEvent: (event: unknown) => void) => Promise<void>>(),
  install: vi.fn<() => Promise<void>>(),
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
    async download(onEvent: (event: unknown) => void) {
      await fake.download(onEvent);
    }
    async install() {
      await fake.install();
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
  fake.download.mockReset().mockResolvedValue(undefined);
  fake.install.mockReset().mockResolvedValue(undefined);
  clearLastCheck();
  useUpdateStore.setState({
    status: 'idle',
    update: null,
    error: null,
    phase: 'closed',
    progress: null,
    blocker: null,
    installError: null,
  });
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

  it('makes no request when updates are turned off while the check starts', async () => {
    const version = fake.version;
    vi.spyOn(await import('@tauri-apps/api/app'), 'getVersion').mockImplementationOnce(async () => {
      fake.prefs.updatesEnabled = false;
      return version;
    });
    await check(true);
    expect(fake.invoke).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().status).toBe('idle');
  });

  it('drops the answer of a channel changed meanwhile and checks the new one', async () => {
    fake.invoke.mockImplementationOnce(async () => {
      fake.prefs.updateChannel = 'beta';
      return metadata(5, '0.10.1');
    });
    fake.invoke.mockResolvedValueOnce(null);
    await check(true);
    await vi.waitFor(() => expect(fake.invoke).toHaveBeenCalledTimes(2));
    expect(fake.invoke).toHaveBeenLastCalledWith('updates_check', { channel: 'beta' });
    expect(fake.closed).toContain(5);
    await vi.waitFor(() => expect(useUpdateStore.getState().status).toBe('upToDate'));
    expect(useUpdateStore.getState().phase).toBe('closed');
  });

  it('reports a failed check', async () => {
    fake.invoke.mockRejectedValueOnce('offline');
    await check();
    expect(useUpdateStore.getState()).toMatchObject({ status: 'error', error: 'offline' });
  });
});

describe('the update dialog flow', () => {
  const offer = async () => {
    fake.invoke.mockResolvedValueOnce(metadata(3, '0.10.1'));
    await check(true);
    fake.invoke.mockReset().mockResolvedValue(undefined);
  };
  const noBlocker = async () => null;

  it('opens on a found release; Later closes it until the next check', async () => {
    await offer();
    expect(useUpdateStore.getState().phase).toBe('offer');
    useUpdateStore.getState().dismiss();
    expect(useUpdateStore.getState().phase).toBe('closed');
  });

  it('counts the download, then installs and restarts when nothing is lost', async () => {
    await offer();
    fake.download.mockImplementation(async (onEvent) => {
      onEvent({ event: 'Started', data: { contentLength: 100 } });
      onEvent({ event: 'Progress', data: { chunkLength: 40 } });
      onEvent({ event: 'Progress', data: { chunkLength: 60 } });
      onEvent({ event: 'Finished' });
    });
    await useUpdateStore.getState().install(noBlocker);
    expect(useUpdateStore.getState().progress).toEqual({ downloaded: 100, total: 100 });
    expect(fake.install).toHaveBeenCalledTimes(1);
    expect(fake.invoke).toHaveBeenCalledWith('updates_restart');
  });

  it('waits for Restart now when restarting would lose work', async () => {
    await offer();
    await useUpdateStore.getState().install(async () => '1 file has unsaved changes.');
    expect(useUpdateStore.getState()).toMatchObject({
      phase: 'ready',
      blocker: '1 file has unsaved changes.',
    });
    expect(fake.install).not.toHaveBeenCalled();
    await useUpdateStore.getState().restartNow();
    expect(fake.install).toHaveBeenCalledTimes(1);
    expect(fake.invoke).toHaveBeenCalledWith('updates_restart');
  });

  it('installs nothing when the download or its signature fails', async () => {
    await offer();
    fake.download.mockRejectedValueOnce('signature verification failed');
    await useUpdateStore.getState().install(noBlocker);
    expect(useUpdateStore.getState()).toMatchObject({
      phase: 'failed',
      installError: 'signature verification failed',
    });
    expect(fake.install).not.toHaveBeenCalled();
    expect(fake.invoke).not.toHaveBeenCalledWith('updates_restart');
  });

  it('does not install while a check is under way', async () => {
    await offer();
    useUpdateStore.setState({ status: 'checking' });
    await useUpdateStore.getState().install(noBlocker);
    expect(fake.download).not.toHaveBeenCalled();
    expect(useUpdateStore.getState().phase).toBe('offer');
  });

  it('says the update is installed when only the restart fails', async () => {
    await offer();
    fake.invoke.mockRejectedValueOnce('restart failed');
    await useUpdateStore.getState().install(noBlocker);
    expect(fake.install).toHaveBeenCalledTimes(1);
    expect(useUpdateStore.getState()).toMatchObject({
      phase: 'installed',
      installError: 'restart failed',
    });
  });

  it('does not check while an update is downloading', async () => {
    await offer();
    useUpdateStore.setState({ phase: 'downloading' });
    await check(true);
    expect(fake.invoke).not.toHaveBeenCalled();
    useUpdateStore.getState().dismiss();
    expect(useUpdateStore.getState().phase).toBe('downloading');
  });
});
