// @vitest-environment happy-dom
import { usePreferencesStore } from '@/modules/settings/preferences';
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type DirEntry, useFileTree } from './useFileTree';

type Read = { path: string; showHidden: boolean; resolve: (entries: DirEntry[]) => void };
const harness = vi.hoisted(() => ({ reads: [] as Read[] }));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (_command: string, args: { path: string; showHidden: boolean }) =>
    new Promise((resolve) => harness.reads.push({ path: args.path, showHidden: args.showHidden, resolve })),
}));
vi.mock('./watch', () => ({
  listenFsChanged: () => Promise.resolve(() => {}),
  watchAdd: () => {},
  watchRemove: () => {},
}));

const dir = (name: string): DirEntry => ({ name, kind: 'dir', size: 0, mtime: 0, gitignored: false });

type Tree = ReturnType<typeof useFileTree>;
const probe: { current: Tree | null } = { current: null };
const tree = () => {
  if (!probe.current) throw new Error('not rendered');
  return probe.current;
};
function Host() {
  const value = useFileTree('/r');
  useLayoutEffect(() => {
    probe.current = value;
  });
  return null;
}

/** Answers the oldest pending read of `path`. */
async function answer(path: string, names: string[]) {
  const index = harness.reads.findIndex((r) => r.path === path);
  const [read] = harness.reads.splice(index, 1);
  await act(async () => read.resolve(names.map(dir)));
  return read;
}
const listed = (path: string) => {
  const node = tree().nodes[path];
  return node?.status === 'loaded' ? node.entries.map((e) => e.name) : null;
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  harness.reads = [];
  usePreferencesStore.setState({ showHidden: false });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
const mount = () => act(() => root.render(createElement(Host)));
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it('keeps the newest listing of a directory when an older read lands last', async () => {
  mount();
  await answer('/r', ['a']);
  let older!: Promise<boolean>;
  let newer!: Promise<boolean>;
  act(() => {
    older = tree().refresh('/r');
    newer = tree().refresh('/r');
  });
  const [first, second] = harness.reads;
  harness.reads = [];
  await act(async () => second.resolve([dir('a'), dir('b')]));
  await act(async () => first.resolve([dir('a')]));
  expect(listed('/r')).toEqual(['a', 'b']);
  // The superseded read answers with the newer read's result.
  await expect(older).resolves.toBe(true);
  await expect(newer).resolves.toBe(true);
});

it('keeps an expanded hidden folder while hidden entries are off', async () => {
  usePreferencesStore.setState({ showHidden: true });
  mount();
  await answer('/r', ['.cache', 'src']);
  act(() => tree().expand('/r/.cache'));
  await answer('/r/.cache', ['inner']);

  act(() => usePreferencesStore.setState({ showHidden: false }));
  expect((await answer('/r', ['src'])).showHidden).toBe(false);
  await answer('/r/.cache', ['inner']);
  expect(tree().expanded.has('/r/.cache')).toBe(true);
  expect(listed('/r/.cache')).toEqual(['inner']);

  // Shown again and gone from disk: now the listing covers it, so it is dropped.
  act(() => usePreferencesStore.setState({ showHidden: true }));
  await answer('/r', ['src']);
  expect(tree().expanded.has('/r/.cache')).toBe(false);
  expect(tree().nodes['/r/.cache']).toBeUndefined();
});
