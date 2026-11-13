// @vitest-environment happy-dom
import type { GitBranchEntry, GitCommitFileChange, GitLogEntry, GitLogScope } from '@/modules/git';
import { act, type ComponentProps, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const commit = (sha: string, subject: string, parents: string[], refs: GitLogEntry['refs'] = []): GitLogEntry => ({
  sha,
  shortSha: sha.slice(0, 7),
  author: 'Mara Ibáñez',
  authorEmail: 'mara@example.com',
  timestampSecs: 1_700_000_000,
  parents,
  refs,
  subject,
  filesChanged: 2,
  insertions: 12,
  deletions: 3,
});
const head = commit(
  'a'.repeat(40),
  'feat(ui): add the commit graph',
  ['b'.repeat(40)],
  [
    { name: 'main', kind: 'head' },
    { name: 'origin/main', kind: 'remote' },
  ],
);
const root0 = commit('b'.repeat(40), 'Initial commit', []);
const branch = (name: string, isHead: boolean): GitBranchEntry => ({
  name,
  kind: 'local',
  worktreePath: null,
  isHead,
  isDetached: false,
});
const file: GitCommitFileChange = {
  path: 'src/graph/rail.ts',
  originalPath: null,
  status: 'M',
  statusLabel: 'Modified',
  added: 10,
  removed: 2,
  isBinary: false,
};

const api = vi.hoisted(() => ({
  log: vi.fn(),
  commitCount: vi.fn(),
  listBranches: vi.fn(),
  remoteUrl: vi.fn(),
  commitFiles: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@/modules/git', () => ({ git: api }));
vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
// happy-dom lays nothing out, so the virtual list would render no rows: render them all.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (i: number) => string | number }) => ({
    getTotalSize: () => count * 32,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: getItemKey(index), size: 32, start: index * 32 })),
  }),
}));

const { GitHistoryPane } = await import('./GitHistoryPane');

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  api.log.mockReset().mockResolvedValue([head, root0]);
  api.commitCount.mockReset().mockResolvedValue(42);
  api.listBranches.mockReset().mockResolvedValue({ branches: [branch('main', true), branch('feature', false)] });
  api.remoteUrl.mockReset().mockResolvedValue(null);
  api.commitFiles.mockReset().mockResolvedValue([file]);
  api.fetch.mockReset().mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render(props: Partial<ComponentProps<typeof GitHistoryPane>> = {}) {
  await act(async () =>
    root.render(createElement(GitHistoryPane, { repoRoot: '/repo', onOpenCommitFile: () => {}, ...props })),
  );
}
const rows = () => [...host.querySelectorAll<HTMLButtonElement>('button[aria-haspopup="dialog"]')];
const button = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim() === text);
const lastScope = () => (api.log.mock.calls[api.log.mock.calls.length - 1]?.[1] as { scope: GitLogScope }).scope;

async function pickScope(label: string) {
  const trigger = button('main');
  if (!trigger) throw new Error('no scope trigger');
  await act(async () => {
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
  });
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find((el) =>
    el.textContent?.startsWith(label),
  );
  if (!item) throw new Error(`no scope ${label}`);
  await act(async () => item.click());
}

describe('GitHistoryPane', () => {
  it('shows each commit with its refs, muted type and changes, and the scope counts', async () => {
    await render();
    expect(api.log).toHaveBeenCalledWith('/repo', { limit: 30, scope: { kind: 'head' } });
    expect(rows()).toHaveLength(2);
    const first = rows()[0];
    expect([...first.querySelectorAll('span')].map((s) => s.textContent)).toEqual(
      expect.arrayContaining(['main', 'origin/main', 'feat(ui):', 'add the commit graph', '+12', '−3']),
    );
    expect(host.textContent).toContain('42 commits · 2 branches');
  });

  it('loads a selected commit’s files through the Git API and opens one', async () => {
    const onOpenCommitFile = vi.fn();
    await render({ onOpenCommitFile });
    await act(async () => rows()[0].click());
    expect(api.commitFiles).toHaveBeenCalledWith('/repo', head.sha);
    const fileRow = button('rail.tssrc/graph+10−2M');
    if (!fileRow) throw new Error('no file row');
    await act(async () => fileRow.click());
    expect(onOpenCommitFile).toHaveBeenCalledWith({
      repoRoot: '/repo',
      sha: head.sha,
      shortSha: head.shortSha,
      subject: head.subject,
      path: file.path,
      originalPath: null,
    });
  });

  it('reloads the log and the count with the scope picked in the toolbar', async () => {
    await render();
    await pickScope('All branches');
    expect(lastScope()).toEqual({ kind: 'all' });
    expect(api.commitCount).toHaveBeenLastCalledWith('/repo', { kind: 'all' });

    const trigger = button('All branches');
    if (!trigger) throw new Error('no scope trigger');
    await act(async () => {
      trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
    });
    const feature = [...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(
      (el) => el.textContent === 'feature',
    );
    await act(async () => feature?.click());
    expect(lastScope()).toEqual({ kind: 'branch', name: 'feature' });
  });

  it('filters the commits from the toolbar field and from the title bar search', async () => {
    let handle: { setQuery: (q: string) => void } | null = null;
    await render({ onSearchHandle: (h) => (handle = h) });
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Filter commits"]');
    if (!input) throw new Error('no filter');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'initial');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('Initial commit')]);

    await act(async () => handle?.setQuery('graph'));
    expect(input.value).toBe('graph');
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringContaining('add the commit graph')]);
  });

  it('fetches, then reloads the log and the branches', async () => {
    await render();
    await act(async () => button('Fetch')?.click());
    expect(api.fetch).toHaveBeenCalledWith('/repo');
    expect(api.log).toHaveBeenCalledTimes(2);
    expect(api.listBranches).toHaveBeenCalledTimes(2);
  });

  it('reloads the log after a failed Fetch too, and reports the failure', async () => {
    api.fetch.mockRejectedValueOnce(new Error('no remote'));
    await render();
    await act(async () => button('Fetch')?.click());
    expect(toast.error).toHaveBeenCalledWith('Fetch failed', { description: 'no remote' });
    expect(api.log).toHaveBeenCalledTimes(2);
  });
});
