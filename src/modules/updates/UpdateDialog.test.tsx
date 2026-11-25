// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

const fake = vi.hoisted(() => ({ dismiss: vi.fn(), install: vi.fn(), restartNow: vi.fn() }));

vi.mock('./updateStore', () => ({
  useUpdateStore: create(() => ({
    update: null as { version: string; currentVersion: string; body?: string } | null,
    phase: 'closed',
    progress: null as { downloaded: number; total: number | null } | null,
    blocker: null as string | null,
    installError: null as string | null,
    dismiss: fake.dismiss,
    install: fake.install,
    restartNow: fake.restartNow,
  })),
}));

const { useUpdateStore } = await import('./updateStore');
const { UpdateDialog } = await import('./UpdateDialog');

const update = { version: '0.10.1', currentVersion: '0.10.0', body: 'Faster tabs.' };
let root: Root;
let restartBlocker: ReturnType<typeof vi.fn<() => Promise<string | null>>>;

async function show(state: Record<string, unknown>) {
  await act(async () => {
    useUpdateStore.setState(state);
    await Promise.resolve();
  });
}

const text = () => document.body.textContent ?? '';
const button = (label: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  for (const fn of Object.values(fake)) fn.mockReset();
  restartBlocker = vi.fn(async () => null);
  useUpdateStore.setState({ update: null, phase: 'closed', progress: null, blocker: null, installError: null });
  root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(UpdateDialog, { restartBlocker })));
});

afterEach(() => {
  act(() => root.unmount());
});

describe('UpdateDialog', () => {
  it('stays closed without a release to offer', () => {
    expect(text()).not.toContain('available');
  });

  it('offers the release with its notes; Later dismisses, Install starts the download', async () => {
    await show({ update, phase: 'offer' });
    expect(text()).toContain('lut 0.10.1 is available');
    expect(text()).toContain('You have 0.10.0.');
    expect(text()).toContain('Faster tabs.');
    act(() => button('Later')?.click());
    expect(fake.dismiss).toHaveBeenCalled();
    act(() => button('Install and restart')?.click());
    expect(fake.install).toHaveBeenCalledWith(restartBlocker);
  });

  it('warns on the offer when restarting would lose work', async () => {
    restartBlocker.mockResolvedValue('1 file has unsaved changes. Restarting will discard them.');
    await show({ update, phase: 'offer' });
    expect(text()).toContain('Restarting will discard them.');
  });

  it('shows the download and cannot be closed meanwhile', async () => {
    await show({ update, phase: 'downloading', progress: { downloaded: 512 * 1024, total: 1024 * 1024 } });
    expect(text()).toContain('Downloading lut 0.10.1');
    expect(text()).toContain('512.0 KB of 1.0 MB');
    expect(button('Close')).toBeNull();
    expect(button('Later')).toBeNull();
  });

  it('asks to restart when restarting loses work', async () => {
    await show({ update, phase: 'ready', blocker: 'A process is still running in a terminal.' });
    expect(text()).toContain('A process is still running in a terminal.');
    act(() => button('Restart now')?.click());
    expect(fake.restartNow).toHaveBeenCalled();
    act(() => button('Cancel')?.click());
    expect(fake.dismiss).toHaveBeenCalled();
  });

  it('reports a failed install', async () => {
    await show({ update, phase: 'failed', installError: 'signature verification failed' });
    expect(text()).toContain("Couldn't install the update");
    expect(text()).toContain('signature verification failed');
    expect(text()).toContain('Nothing was installed.');
  });
});
