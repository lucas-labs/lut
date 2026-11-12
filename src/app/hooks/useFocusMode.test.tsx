// @vitest-environment happy-dom
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const win = vi.hoisted(() => ({
  fullScreen: false,
  calls: [] as boolean[],
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isFullscreen: async () => win.fullScreen,
    setFullscreen: async (value: boolean) => {
      win.calls.push(value);
      win.fullScreen = value;
    },
  }),
}));

const { useFocusMode } = await import('./useFocusMode');

const probe: { current: ReturnType<typeof useFocusMode> | null } = { current: null };
function Host() {
  const result = useFocusMode();
  useLayoutEffect(() => {
    probe.current = result;
  });
  return null;
}
const api = () => {
  if (!probe.current) throw new Error('not rendered');
  return probe.current;
};

let root: Root;
let host: HTMLElement;

/** Lets the window calls (promises) run. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  win.fullScreen = false;
  win.calls = [];
  host = document.createElement('div');
  root = createRoot(host);
  act(() => root.render(createElement(Host)));
});

afterEach(() => {
  act(() => root.unmount());
});

describe('useFocusMode', () => {
  it('enters full screen with focus mode and leaves it on the way out', async () => {
    act(() => api().toggleFocusMode());
    await settle();
    expect(api().focusMode).toBe(true);
    expect(win.fullScreen).toBe(true);

    act(() => api().toggleFocusMode());
    await settle();
    expect(api().focusMode).toBe(false);
    expect(win.fullScreen).toBe(false);
    expect(win.calls).toEqual([true, false]);
  });

  it('keeps a window that was already full screen in full screen when focus mode ends', async () => {
    win.fullScreen = true;
    act(() => api().toggleFocusMode());
    await settle();
    act(() => api().toggleFocusMode());
    await settle();
    expect(api().focusMode).toBe(false);
    expect(win.fullScreen).toBe(true);
    expect(win.calls).toEqual([]);
  });

  it('alternates on two quick presses and leaves the window as it was', async () => {
    act(() => {
      api().toggleFocusMode();
      api().toggleFocusMode();
    });
    await settle();
    expect(api().focusMode).toBe(false);
    expect(win.fullScreen).toBe(false);
    expect(win.calls).toEqual([]);
  });

  it('lets a quick leave and enter again end in full screen', async () => {
    act(() => api().toggleFocusMode());
    await settle();
    act(() => {
      api().toggleFocusMode();
      api().toggleFocusMode();
    });
    await settle();
    expect(api().focusMode).toBe(true);
    expect(win.fullScreen).toBe(true);
    expect(win.calls).toEqual([true, false, true]);
  });

  it('toggles full screen twice on two quick presses', async () => {
    act(() => {
      api().toggleFullScreen();
      api().toggleFullScreen();
    });
    await settle();
    expect(win.calls).toEqual([true, false]);
  });

  it('toggles full screen on its own, without focus mode', async () => {
    act(() => api().toggleFullScreen());
    await settle();
    expect(win.fullScreen).toBe(true);
    expect(api().focusMode).toBe(false);
    act(() => api().toggleFullScreen());
    await settle();
    expect(win.fullScreen).toBe(false);
  });
});
