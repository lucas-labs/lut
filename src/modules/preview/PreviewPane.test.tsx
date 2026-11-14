// @vitest-environment happy-dom
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewPane, type PreviewPaneHandle } from './PreviewPane';

vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn(async () => {}) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// The frame is the subject, not the page in it: never fetch the dev server URL.
(
  window as unknown as { happyDOM: { settings: { disableIframePageLoading: boolean } } }
).happyDOM.settings.disableIframePageLoading = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function render(url: string, onUrlChange = vi.fn()) {
  const ref = createRef<PreviewPaneHandle>();
  act(() => root.render(createElement(PreviewPane, { ref, url, visible: true, onUrlChange })));
  return { ref, onUrlChange };
}

const frame = () => host.querySelector('iframe');

describe('PreviewPane', () => {
  it('refuses to load an internal host', () => {
    render('http://asset.localhost/secret.png');

    expect(frame()).toBeNull();
    expect(host.textContent).toContain('This URL cannot be loaded in preview.');
  });

  it('loads an allowed dev server URL in the sandboxed frame', () => {
    render('http://localhost:5173/');

    expect(frame()?.getAttribute('src')).toBe('http://localhost:5173/');
    expect(frame()?.getAttribute('sandbox')).not.toContain('allow-top-navigation');
  });

  it('reload requests the current URL again', () => {
    const { ref } = render('http://localhost:5173/');
    const before = frame();

    act(() => ref.current?.reload());

    expect(frame()).not.toBe(before);
    expect(frame()?.getAttribute('src')).toBe('http://localhost:5173/');
  });

  it('the reload button requests the current URL again', () => {
    render('http://localhost:5173/');
    const before = frame();

    act(() => host.querySelector<HTMLButtonElement>('button[aria-label="Reload"]')?.click());

    expect(frame()).not.toBe(before);
    expect(frame()?.getAttribute('src')).toBe('http://localhost:5173/');
  });
});
