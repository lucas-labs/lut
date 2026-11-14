// @vitest-environment happy-dom
import type { GitChangedFile, GitStatusSnapshot } from '@/modules/git';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { act, type ComponentProps, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirEntry } from './lib/useFileTree';

const entry = (name: string, kind: DirEntry['kind'] = 'file'): DirEntry => ({
  name,
  kind,
  size: 0,
  mtime: 0,
  gitignored: false,
});

/** The fake disk, by directory; each test roots it at its own path so no expansion carries over between tests. */
const disk = vi.hoisted(() => ({
  dirs: new Map<string, DirEntry[]>(),
  reads: [] as string[],
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: { path: string }) => {
    if (command === 'fs_read_dir') {
      disk.reads.push(args.path);
      return Promise.resolve(disk.dirs.get(args.path) ?? []);
    }
    if (command === 'fs_canonicalize') return Promise.resolve(args.path);
    return Promise.reject(new Error(`unexpected ${command}`));
  },
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: () => Promise.resolve(() => {}) }),
}));
vi.mock('./lib/watch', () => ({
  listenFsChanged: () => Promise.resolve(() => {}),
  watchAdd: () => {},
  watchRemove: () => {},
}));
// happy-dom lays nothing out, so the virtual list would render no rows: render them all.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (i: number) => string | number }) => ({
    getTotalSize: () => count * 24,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: getItemKey(index), size: 24, start: index * 24 })),
    scrollToIndex: () => {},
  }),
}));

const { FileExplorer } = await import('./FileExplorer');

const changed = (path: string, status: string): GitChangedFile => ({
  path,
  originalPath: null,
  indexStatus: ' ',
  worktreeStatus: status,
  staged: false,
  unstaged: true,
  untracked: false,
  statusLabel: 'Modified',
});

let rootPath = '';
let rootCount = 0;
let host: HTMLDivElement;
let root: Root;
const onOpenFile = vi.fn();

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  rootPath = `/repo${++rootCount}`;
  disk.reads = [];
  disk.dirs = new Map([
    [rootPath, [entry('src', 'dir'), entry('README.md')]],
    [`${rootPath}/src`, [entry('lib', 'dir'), entry('app.ts')]],
    [`${rootPath}/src/lib`, [entry('util.ts')]],
  ]);
  usePreferencesStore.setState({ showHidden: false, explorerGitDecorations: true });
  onOpenFile.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render(props: Partial<ComponentProps<typeof FileExplorer>> = {}) {
  await act(async () => root.render(createElement(FileExplorer, { rootPath, onOpenFile, ...props })));
}
const row = (rel: string) => host.querySelector<HTMLButtonElement>(`[data-fs-path="${rootPath}/${rel}"]`);
const click = (el: HTMLElement | null) =>
  act(async () => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
const reads = (rel: string) => disk.reads.filter((p) => p === (rel ? `${rootPath}/${rel}` : rootPath)).length;
/** A row's Git mark: its last cell. */
const mark = (rel: string) => row(rel)?.lastElementChild?.textContent ?? null;

describe('FileExplorer', () => {
  it('lists each folder once as it is expanded', async () => {
    await render();
    expect(reads('')).toBe(1);
    expect(row('src')?.getAttribute('aria-expanded')).toBe('false');

    await click(row('src'));
    expect(reads('src')).toBe(1);
    expect(row('src')?.getAttribute('aria-expanded')).toBe('true');
    expect(row('src/app.ts')).not.toBeNull();

    await click(row('src/lib'));
    expect(reads('src/lib')).toBe(1);
    expect(row('src/lib/util.ts')).not.toBeNull();
    expect(reads('')).toBe(1);
    expect(reads('src')).toBe(1);
  });

  it('opens a file on click', async () => {
    await render();
    await click(row('README.md'));
    expect(onOpenFile).toHaveBeenCalledWith(`${rootPath}/README.md`);
  });

  it('marks changed files with their status and closed folders with changes inside', async () => {
    const gitStatus: GitStatusSnapshot = {
      repoRoot: rootPath,
      branch: 'main',
      upstream: null,
      ahead: 0,
      behind: 0,
      isDetached: false,
      truncated: false,
      changedFiles: [changed('src/app.ts', 'M')],
    };
    await render({ gitStatus });
    expect(mark('src')).toBe('•');
    expect(mark('README.md')).toBe('');

    await click(row('src'));
    expect(mark('src')).toBe('');
    expect(mark('src/app.ts')).toBe('M');
  });

  it('closes every open folder from the header', async () => {
    await render();
    await click(row('src'));
    await click(row('src/lib'));
    expect(row('src/lib/util.ts')).not.toBeNull();

    await click(host.querySelector('[aria-label="Collapse folders"]'));
    expect(row('src')?.getAttribute('aria-expanded')).toBe('false');
    expect(row('src/app.ts')).toBeNull();
    expect(row('src/lib/util.ts')).toBeNull();
  });
});
