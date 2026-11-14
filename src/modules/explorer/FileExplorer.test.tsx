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
  searches: [] as string[],
  /** Holds the next searches until `releaseSearch`, to see what shows while they run. */
  holdSearch: false,
  releaseSearch: () => {},
  /** The file operations asked for, without the workspace each one carries. */
  ops: [] as { command: string; args: Record<string, unknown> }[],
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args: { path: string; workspace?: unknown }) => {
    if (command === 'fs_read_dir') {
      disk.reads.push(args.path);
      return Promise.resolve(disk.dirs.get(args.path) ?? []);
    }
    if (command === 'fs_canonicalize') return Promise.resolve(args.path);
    if (command === 'fs_search') {
      const { root, query, showHidden } = args as unknown as { root: string; query: string; showHidden: boolean };
      disk.searches.push(query);
      const hit = (rel: string) => ({ path: `${root}/${rel}`, rel, name: rel.split('/').pop(), is_dir: false });
      const answer = {
        hits: showHidden ? [hit('.app/secret'), hit('src/app.ts')] : [hit('src/app.ts')],
        truncated: false,
      };
      if (!disk.holdSearch) return Promise.resolve(answer);
      return new Promise((resolve) => {
        disk.releaseSearch = () => resolve(answer);
      });
    }
    if (command === 'fs_rename' || command === 'fs_delete') {
      const { workspace: _workspace, ...rest } = args;
      disk.ops.push({ command, args: rest });
      return Promise.resolve();
    }
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
  disk.ops = [];
  disk.searches = [];
  disk.holdSearch = false;
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

/** Types into a React-controlled input. */
function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setValue?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((el) => el.textContent === label) ?? null;

describe('FileExplorer search', () => {
  const searchInput = () => host.querySelector<HTMLInputElement>('input[aria-label="Search files"]');
  /** Types a query and waits out the search's debounce. */
  const search = (query: string) =>
    act(async () => {
      const input = searchInput();
      if (input) type(input, query);
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

  it('searches once the query is long enough, opens a hit, and starts empty after closing', async () => {
    await render();
    await click(host.querySelector('button[aria-label="Search files"]'));
    await search('a');
    expect(disk.searches).toEqual([]);

    await search('app');
    expect(disk.searches).toEqual(['app']);
    const hit = host.querySelector<HTMLElement>(`[title="${rootPath}/src/app.ts"]`);
    expect(hit?.textContent).toContain('app.ts');
    await click(hit);
    expect(onOpenFile).toHaveBeenCalledWith(`${rootPath}/src/app.ts`);

    await click(host.querySelector('button[aria-label="Search files"]'));
    expect(searchInput()).toBeNull();
    await click(host.querySelector('button[aria-label="Search files"]'));
    expect(searchInput()?.value).toBe('');
  });

  it('drops hidden hits as soon as hidden entries are turned off, before the new answer', async () => {
    usePreferencesStore.setState({ showHidden: true });
    await render();
    await click(host.querySelector('button[aria-label="Search files"]'));
    await search('app');
    const hidden = () => host.querySelector(`[title="${rootPath}/.app/secret"]`);
    expect(hidden()).not.toBeNull();

    disk.holdSearch = true;
    await act(async () => {
      usePreferencesStore.setState({ showHidden: false });
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(hidden()).toBeNull();
    expect(host.textContent).toContain('Searching…');

    await act(async () => disk.releaseSearch());
    expect(host.querySelector(`[title="${rootPath}/src/app.ts"]`)).not.toBeNull();
    expect(hidden()).toBeNull();
  });
});

describe('FileExplorer file operations', () => {
  it('renames a file in its folder', async () => {
    await render();
    await click(row('src'));
    await act(async () => {
      row('src/app.ts')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    const input = host.querySelector<HTMLInputElement>('input[value="app.ts"]');
    expect(input).not.toBeNull();
    await act(async () => {
      if (!input) return;
      type(input, 'main.ts');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(disk.ops).toEqual([
      { command: 'fs_rename', args: { from: `${rootPath}/src/app.ts`, to: `${rootPath}/src/main.ts` } },
    ]);
  });

  it('deletes a file from its menu after the confirming click', async () => {
    await render();
    await act(async () => {
      row('README.md')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    await click(menuItem('Delete'));
    expect(disk.ops).toEqual([]);
    await click(menuItem('Click again to confirm'));
    expect(disk.ops).toEqual([{ command: 'fs_delete', args: { path: `${rootPath}/README.md` } }]);
  });
});
