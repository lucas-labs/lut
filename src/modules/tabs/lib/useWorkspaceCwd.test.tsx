// @vitest-environment happy-dom
import type { Tab } from '@/modules/navigation';
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useWorkspaceCwd } from './useWorkspaceCwd';

type Result = ReturnType<typeof useWorkspaceCwd>;
const probe: { current: Result | null } = { current: null };
/** The hook as last rendered. */
const result = () => {
  if (!probe.current) throw new Error('not rendered');
  return probe.current;
};

function Host({ active, tabs }: { active: Tab | undefined; tabs: Tab[] }) {
  const value = useWorkspaceCwd(active, tabs, '/home');
  useLayoutEffect(() => {
    probe.current = value;
  });
  return null;
}

const terminal = (id: number, cwd: string | undefined): Tab => ({
  id,
  kind: 'terminal',
  spaceId: 'default',
  title: 'shell',
  cwd,
  paneTree: { kind: 'leaf', id: id + 1 },
  activeLeafId: id + 1,
});
const editor: Tab = {
  id: 9,
  kind: 'editor',
  spaceId: 'default',
  title: 'a.ts',
  path: '/elsewhere/a.ts',
  dirty: false,
  preview: false,
};

let root: Root;
function render(active: Tab | undefined, tabs: Tab[]) {
  act(() => root.render(createElement(Host, { active, tabs })));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
});

it('follows the active terminal', () => {
  const a = terminal(1, '/a');
  render(a, [a]);
  expect(result().explorerRoot).toBe('/a');
  expect(result().inheritedCwdForNewTab()).toBe('/a');
});

it('keeps the last active terminal directory while an editor tab is active', () => {
  const a = terminal(1, '/a');
  const b = terminal(3, '/b');
  render(b, [a, b, editor]);
  render(editor, [a, b, editor]);
  expect(result().explorerRoot).toBe('/b');
  expect(result().inheritedCwdForNewTab()).toBe('/b');
});

it('falls back to any terminal, then home', () => {
  const a = terminal(1, '/a');
  render(editor, [a, editor]);
  expect(result().explorerRoot).toBe('/a');
  expect(result().inheritedCwdForNewTab()).toBe('/home');
  render(editor, [editor]);
  expect(result().explorerRoot).toBe('/home');
});
