// @vitest-environment happy-dom
import type { GitLogEntry, GitLogScope } from '@/modules/git';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ log: vi.fn(), commitCount: vi.fn() }));
vi.mock('@/modules/git', () => ({ git: api }));

const { useCommitLog } = await import('./useCommitLog');

const commit = (n: number) => ({ sha: n.toString(16).padStart(40, '0'), parents: [] }) as unknown as GitLogEntry;
const page = (from: number) => Array.from({ length: 30 }, (_, i) => commit(from + i));
const scope: GitLogScope = { kind: 'all' };

let log: ReturnType<typeof useCommitLog>;
const report = (latest: typeof log) => {
  log = latest;
};
function Probe({ onRender, scope: probed = scope }: { onRender: typeof report; scope?: GitLogScope }) {
  onRender(useCommitLog('/repo', probed));
  return null;
}
/** A git.log answer the test resolves when it wants to. */
function pendingLog() {
  let resolve: (entries: GitLogEntry[]) => void = () => {};
  api.log.mockReturnValueOnce(new Promise<GitLogEntry[]>((r) => (resolve = r)));
  return (entries: GitLogEntry[]) => resolve(entries);
}

let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  api.log.mockReset().mockResolvedValueOnce(page(0));
  api.commitCount.mockReset().mockResolvedValue(90);
  host = document.createElement('div');
  root = createRoot(host);
  await act(async () => root.render(createElement(Probe, { onRender: report })));
});
afterEach(() => act(() => root.unmount()));

const lastSkip = () => (api.log.mock.calls[api.log.mock.calls.length - 1]?.[1] as { skip?: number }).skip;

describe('useCommitLog', () => {
  it('pages by what git returned, so commits added on top do not stall it', async () => {
    expect(log.commits).toHaveLength(30);
    // 30 commits landed on top since the first page: git's next window is the page already shown.
    api.log.mockResolvedValueOnce(page(0));
    await act(async () => log.loadMore());
    expect(lastSkip()).toBe(30);
    expect(log.commits).toHaveLength(30);

    api.log.mockResolvedValueOnce(page(30));
    await act(async () => log.loadMore());
    expect(lastSkip()).toBe(60);
    expect(log.commits).toHaveLength(60);
  });

  it('retries the request that failed: the first page after a reload, the same page after a page', async () => {
    api.log.mockRejectedValueOnce(new Error('offline'));
    await act(async () => log.reload());
    expect(log.status).toBe('error');
    expect(log.commits).toHaveLength(30);

    api.log.mockResolvedValueOnce(page(0));
    await act(async () => log.retry());
    expect(lastSkip()).toBeUndefined();
    expect(log.status).toBe('idle');

    api.log.mockRejectedValueOnce(new Error('offline'));
    await act(async () => log.loadMore());
    expect(log.status).toBe('error');
    api.log.mockResolvedValueOnce(page(30));
    await act(async () => log.retry());
    expect(lastSkip()).toBe(30);
    expect(log.commits).toHaveLength(60);
  });

  it('drops a page still loading from before a reload, without blocking the next one', async () => {
    const stalePage = pendingLog();
    let loading: Promise<void> = Promise.resolve();
    act(() => {
      loading = log.loadMore();
    });
    api.log.mockResolvedValueOnce(page(0));
    await act(async () => log.reload());

    api.log.mockResolvedValueOnce(page(30));
    await act(async () => log.loadMore());
    expect(lastSkip()).toBe(30);
    expect(log.commits).toHaveLength(60);

    await act(async () => {
      stalePage(page(100));
      await loading;
    });
    expect(log.commits).toHaveLength(60);
    expect(log.offset).toBe(60);
  });

  it('loads the next page of a new scope while the old scope’s page is still on its way', async () => {
    const stalePage = pendingLog();
    act(() => void log.loadMore());
    api.log.mockResolvedValueOnce(page(200));
    await act(async () => root.render(createElement(Probe, { onRender: report, scope: { kind: 'head' } })));
    expect(log.commits[0].sha).toBe(commit(200).sha);

    api.log.mockResolvedValueOnce(page(230));
    await act(async () => log.loadMore());
    expect(api.log).toHaveBeenLastCalledWith('/repo', { limit: 30, skip: 30, scope: { kind: 'head' } });
    expect(log.commits).toHaveLength(60);

    await act(async () => stalePage(page(0)));
    expect(log.commits).toHaveLength(60);
  });
});
