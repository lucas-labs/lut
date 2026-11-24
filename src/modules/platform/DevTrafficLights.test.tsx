// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DevTrafficLights } from './DevTrafficLights';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const win = vi.hoisted(() => ({
  fullScreen: false,
  close: vi.fn(() => Promise.resolve()),
  minimize: vi.fn(() => Promise.resolve()),
  toggleMaximize: vi.fn(() => Promise.resolve()),
}));

vi.mock('./window', () => ({
  closeWindow: win.close,
  minimizeWindow: win.minimize,
  toggleMaximizeWindow: win.toggleMaximize,
}));
vi.mock('./useWindowFullScreen', () => ({ useWindowFullScreen: () => win.fullScreen }));

let host: HTMLDivElement;
let root: Root;

const button = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

beforeEach(() => {
  win.fullScreen = false;
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('DevTrafficLights', () => {
  it('closes, minimizes and zooms the window', () => {
    act(() => root.render(<DevTrafficLights />));
    act(() => button('Close')?.click());
    act(() => button('Minimize')?.click());
    act(() => button('Zoom')?.click());
    expect(win.close).toHaveBeenCalledOnce();
    expect(win.minimize).toHaveBeenCalledOnce();
    expect(win.toggleMaximize).toHaveBeenCalledOnce();
  });

  it('hides in full screen, as macOS hides its own', () => {
    win.fullScreen = true;
    act(() => root.render(<DevTrafficLights />));
    expect(host.querySelector('[data-dev-traffic-lights]')).toBeNull();
  });
});
