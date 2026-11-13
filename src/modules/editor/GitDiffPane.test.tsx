// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  language: null as null | ((value: null) => void),
}));

vi.mock('./lib/diffCache', () => {
  const key = (...parts: unknown[]) => parts.join('|');
  const diff = { originalContent: 'a', modifiedContent: 'b', isBinary: false, fallbackPatch: '' };
  return {
    workingDiffKey: key,
    commitDiffKey: key,
    getCachedDiff: (k: string) => harness.cache.get(k),
    // The diff lands in the cache before the pane's language lookup settles.
    fetchWorkingDiff: (repoRoot: string, path: string, mode: string) => {
      harness.cache.set(key(repoRoot, path, mode), diff);
      return Promise.resolve(diff);
    },
    fetchCommitDiff: vi.fn(),
  };
});
vi.mock('./lib/languageResolver', () => ({
  resolveLanguageSync: () => null,
  resolveLanguage: () =>
    new Promise((resolve) => {
      harness.language = resolve;
    }),
}));
vi.mock('./lib/extensions', () => ({
  buildSharedExtensions: () => [],
  DEFAULT_INDENT: [],
  languageCompartment: { of: () => [] },
}));
vi.mock('./lib/useEditorThemeExt', () => ({ useEditorThemeExt: () => [] }));
vi.mock('@uiw/react-codemirror', () => ({ default: () => createElement('div', { 'data-diff': '' }) }));

const { GitDiffPane } = await import('./GitDiffPane');

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  harness.cache.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = () =>
  act(() =>
    root.render(
      createElement(GitDiffPane, {
        active: true,
        // A new object each render, as GitDiffStack passes it.
        source: { kind: 'working', repoRoot: '/repo', path: 'a.ts', mode: '+', originalPath: null },
      }),
    ),
  );

it('finishes loading when a re-render cancels a load whose diff is already cached', async () => {
  render();
  await act(async () => {});
  render();
  await act(async () => harness.language?.(null));
  expect(host.querySelector('[data-diff]')).not.toBeNull();
});
