// @vitest-environment happy-dom
import type { Tab } from '@/modules/navigation';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useWindowTitle } from './useWindowTitle';

const setWindowTitle = vi.hoisted(() => vi.fn((_title: string) => Promise.resolve()));
vi.mock('@/modules/platform', () => ({ setWindowTitle }));

type Policy = (profileId: string | undefined) => boolean;
const allowAll: Policy = () => true;

function Host({ active, policy }: { active: Tab | undefined; policy: Policy }) {
  useWindowTitle(active, policy);
  return null;
}

const terminal = (over: Partial<Extract<Tab, { kind: 'terminal' }>> = {}): Tab => ({
  id: 1,
  kind: 'terminal',
  spaceId: 'default',
  title: 'shell',
  cwd: '/home/me/src',
  paneTree: { kind: 'leaf', id: 2 },
  activeLeafId: 2,
  ...over,
});
const editor: Tab = {
  id: 9,
  kind: 'editor',
  spaceId: 'default',
  title: 'main.rs',
  path: '/home/me/src/main.rs',
  dirty: false,
  preview: false,
};

let root: Root;
function render(active: Tab | undefined, policy: Policy = allowAll) {
  act(() => root.render(createElement(Host, { active, policy })));
}
/** The title shown last, checked to be the same on the document and the OS window. */
function title(): string {
  expect(setWindowTitle).toHaveBeenLastCalledWith(document.title);
  return document.title;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  setWindowTitle.mockClear();
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
});

it('names a terminal tab by its folder, then lut', () => {
  render(terminal());
  expect(title()).toBe('src - lut');
});

it('uses the name the user gave the tab', () => {
  render(terminal({ customTitle: 'Server' }));
  expect(title()).toBe('Server - lut');
});

it("uses the title the pane's shell set only when its profile lets it name the tab", () => {
  const tab = terminal({ paneTree: { kind: 'leaf', id: 2, shellTitle: 'vim notes.md' } });
  render(tab);
  expect(title()).toBe('vim notes.md - lut');
  render(tab, () => false);
  expect(title()).toBe('src - lut');
});

it('names an editor tab by its file', () => {
  render(editor);
  expect(title()).toBe('main.rs - lut');
});

it('says just lut without a tab', () => {
  render(undefined);
  expect(title()).toBe('lut');
});

it('follows the active tab', () => {
  render(terminal());
  render(editor);
  expect(title()).toBe('main.rs - lut');
  expect(setWindowTitle).toHaveBeenCalledTimes(2);
});
