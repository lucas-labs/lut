// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ipc = vi.hoisted(() => ({
  handler: null as ((e: { payload: string[] }) => void) | null,
  unlisten: vi.fn(),
  // While set, `listen` waits for it before it resolves.
  gate: null as Promise<void> | null,
  launchFiles: [] as string[],
  drains: 0,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (event: string, handler: (e: { payload: string[] }) => void) => {
    if (event === 'lut:open-file') ipc.handler = handler;
    if (ipc.gate) await ipc.gate;
    return ipc.unlisten;
  },
}));

vi.mock('@/modules/platform', () => ({
  consumeLaunchFiles: async () => {
    ipc.drains++;
    const files = ipc.launchFiles;
    ipc.launchFiles = [];
    return files;
  },
}));

const { useLaunchFiles } = await import('./useLaunchFiles');

let root: Root;
let openFile: ReturnType<typeof vi.fn<(path: string, pin: boolean) => void>>;

function Host({ booted }: { booted: boolean }) {
  useLaunchFiles({ booted, openFile });
  return null;
}

const render = (booted: boolean) => act(() => root.render(createElement(Host, { booted })));

/** Lets the IPC promises run. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ipc.handler = null;
  ipc.unlisten = vi.fn();
  ipc.gate = null;
  ipc.launchFiles = [];
  ipc.drains = 0;
  openFile = vi.fn();
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
});

describe('useLaunchFiles', () => {
  it('opens the launch files pinned once the spaces restore is done, and only once', async () => {
    ipc.launchFiles = ['/a.ts', '/b.md'];
    render(false);
    await settle();
    expect(openFile).not.toHaveBeenCalled();
    expect(ipc.drains).toBe(0);

    render(true);
    await settle();
    expect(openFile.mock.calls).toEqual([
      ['/a.ts', true],
      ['/b.md', true],
    ]);

    render(true);
    await settle();
    expect(openFile).toHaveBeenCalledTimes(2);
  });

  it('opens the files the OS sends while running, pinned', async () => {
    render(true);
    await settle();
    act(() => ipc.handler?.({ payload: ['/c.ts', '/d.ts'] }));
    expect(openFile.mock.calls).toEqual([
      ['/c.ts', true],
      ['/d.ts', true],
    ]);
  });

  it('stops listening on unmount', async () => {
    render(true);
    await settle();
    act(() => root.unmount());
    expect(ipc.unlisten).toHaveBeenCalledOnce();
    root = createRoot(document.createElement('div'));
  });

  it('stops listening when unmounted before the listener is attached', async () => {
    let attach = () => {};
    ipc.gate = new Promise((resolve) => (attach = resolve));
    render(true);
    act(() => root.unmount());
    expect(ipc.unlisten).not.toHaveBeenCalled();
    attach();
    await settle();
    expect(ipc.unlisten).toHaveBeenCalledOnce();
    root = createRoot(document.createElement('div'));
  });
});
