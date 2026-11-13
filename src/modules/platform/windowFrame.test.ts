// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  platform: { IS_WINDOWS: false, USE_CUSTOM_WINDOW_CONTROLS: true },
  maximized: false,
  fullscreen: false,
  onResized: null as (() => void) | null,
}));

vi.mock('./os', () => ({
  get IS_WINDOWS() {
    return harness.platform.IS_WINDOWS;
  },
  get USE_CUSTOM_WINDOW_CONTROLS() {
    return harness.platform.USE_CUSTOM_WINDOW_CONTROLS;
  },
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isMaximized: async () => harness.maximized,
    isFullscreen: async () => harness.fullscreen,
    onResized: async (listener: () => void) => {
      harness.onResized = listener;
      return () => {};
    },
  }),
}));

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.resetModules();
  harness.platform = { IS_WINDOWS: false, USE_CUSTOM_WINDOW_CONTROLS: true };
  harness.maximized = false;
  harness.fullscreen = false;
  harness.onResized = null;
});

describe('initWindowFrame', () => {
  it('paints the frame on Linux and drops it while maximized or full screen', async () => {
    const { initWindowFrame } = await import('./windowFrame');
    const root = document.createElement('html');
    initWindowFrame(root);
    await settle();
    expect(root.dataset.chrome).toBe('borderless');
    expect(root.hasAttribute('data-window-maximized')).toBe(false);

    harness.maximized = true;
    harness.onResized?.();
    await settle();
    expect(root.hasAttribute('data-window-maximized')).toBe(true);

    harness.maximized = false;
    harness.fullscreen = true;
    harness.onResized?.();
    await settle();
    expect(root.hasAttribute('data-window-maximized')).toBe(true);
  });

  it('leaves the frame to Windows and macOS', async () => {
    for (const platform of [
      { IS_WINDOWS: true, USE_CUSTOM_WINDOW_CONTROLS: true },
      { IS_WINDOWS: false, USE_CUSTOM_WINDOW_CONTROLS: false },
    ]) {
      vi.resetModules();
      harness.platform = platform;
      const { initWindowFrame } = await import('./windowFrame');
      const root = document.createElement('html');
      initWindowFrame(root);
      await settle();
      expect(root.dataset.chrome).toBeUndefined();
      expect(harness.onResized).toBeNull();
    }
  });
});
