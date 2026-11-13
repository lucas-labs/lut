// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const listings: Record<string, string[]> = { '/work/a': ['from-a'], '/work/b': ['from-b'] };
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (_command: string, args: { path: string }) => Promise.resolve(listings[args.path] ?? []),
}));

const { CwdBreadcrumb } = await import('./CwdBreadcrumb');

let host: HTMLDivElement;
let root: Root;
const onCd = vi.fn();
beforeEach(() => {
  onCd.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (cwd: string) =>
  act(() => root.render(createElement(CwdBreadcrumb, { cwd, filePath: null, home: null, onCd })));
const items = () => [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent);

it('lists the new folder when the cwd changes while the menu is open', async () => {
  render('/work/a');
  const current = host.querySelector('[aria-current="location"]');
  if (!current) throw new Error('no current segment');
  await act(async () => {
    current.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
  });
  expect(items()).toEqual(['from-a']);
  render('/work/b');
  await act(async () => {});
  expect(items()).toEqual(['from-b']);
  await act(async () => (document.querySelector('[role="menuitem"]') as HTMLElement).click());
  expect(onCd).toHaveBeenCalledWith('/work/b/from-b');
});
