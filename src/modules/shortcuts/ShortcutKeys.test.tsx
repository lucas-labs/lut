// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ShortcutKeys } from './ShortcutKeys';

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

it('shows Ctrl as a caret and Shift as its arrow, joined with + (Windows and Linux, the test environment)', () => {
  act(() => root.render(createElement(ShortcutKeys, { label: 'Ctrl Shift F' })));
  expect(host.textContent).toBe('^+Shift+F');
  const shift = host.querySelector('[aria-hidden]');
  expect(shift?.nextElementSibling?.textContent).toBe('Shift');
  // Vite inlines the small file as a data URI; either way it is one URL every key shares.
  expect((shift as HTMLElement).style.maskImage).toMatch(/^url\("(data:image\/svg\+xml|.*shift\.svg)/);
});

it('keeps the other keys as text', () => {
  act(() => root.render(createElement(ShortcutKeys, { label: 'Ctrl Alt PageDown' })));
  expect(host.textContent).toBe('^+Alt+PageDown');
  expect(host.querySelector('[aria-hidden]')).toBeNull();
});
