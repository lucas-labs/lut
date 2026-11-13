// @vitest-environment happy-dom
import { act, type ComponentProps, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceControlFileEntry, SourceControlPanelState } from './useSourceControlPanel';

const harness = vi.hoisted(() => ({ scm: null as unknown as SourceControlPanelState }));

vi.mock('./useSourceControlPanel', () => ({ useSourceControlPanel: () => harness.scm }));
// happy-dom lays nothing out, so the virtual list would render no rows: render them all.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count, getItemKey }: { count: number; getItemKey: (i: number) => string | number }) => ({
    getTotalSize: () => count * 26,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({ index, key: getItemKey(index), size: 26, start: index * 26 })),
    scrollToIndex: () => {},
  }),
}));

const { GitPanel } = await import('./GitPanel');

const file = (path: string, statusCode: string, staged: boolean): SourceControlFileEntry => ({
  key: path,
  path,
  originalPath: null,
  statusCode,
  statusLabel: statusCode,
  checkState: staged ? 'checked' : 'unchecked',
  staged,
  unstaged: !staged,
  untracked: false,
});
const staged = file('src/restore.ts', 'M', true);
const unstaged = file('vite.config.ts', 'D', false);

function state(overrides: Partial<SourceControlPanelState> = {}): SourceControlPanelState {
  const entry = { mode: '+', indexStatus: 'M', worktreeStatus: ' ', untracked: false } as const;
  return {
    panelState: 'ready',
    repo: { repoRoot: '/repo' } as SourceControlPanelState['repo'],
    status: {
      repoRoot: '/repo',
      branch: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 0,
      isDetached: false,
      truncated: false,
      changedFiles: [],
    },
    selected: null,
    commitMessage: '',
    actionBusy: null,
    statusError: null,
    actionError: null,
    remoteError: null,
    actionMessage: null,
    stagedEntries: [
      {
        ...entry,
        key: '+:src/restore.ts',
        path: 'src/restore.ts',
        statusLabel: 'M',
        statusCode: 'M',
        originalPath: null,
      },
    ],
    unstagedEntries: [],
    fileEntries: [staged, unstaged],
    headerCheckState: 'indeterminate',
    allClean: false,
    canPush: true,
    pushHint: null,
    selectionTransition: 'none',
    stagedEmptyText: '',
    unstagedEmptyText: '',
    pendingDiscard: null,
    setCommitMessage: vi.fn(),
    refresh: vi.fn(() => Promise.resolve()),
    selectEntry: vi.fn(() => Promise.resolve()),
    selectFile: vi.fn(() => Promise.resolve()),
    stageEntry: vi.fn(() => Promise.resolve()),
    unstageEntry: vi.fn(() => Promise.resolve()),
    toggleStageFile: vi.fn(() => Promise.resolve()),
    toggleAll: vi.fn(() => Promise.resolve()),
    requestDiscardEntry: vi.fn(),
    requestDiscardFile: vi.fn(),
    requestDiscardAll: vi.fn(),
    confirmPendingDiscard: vi.fn(() => Promise.resolve()),
    cancelPendingDiscard: vi.fn(),
    stageAllEntries: vi.fn(() => Promise.resolve()),
    unstageAllEntries: vi.fn(() => Promise.resolve()),
    commit: vi.fn(() => Promise.resolve()),
    push: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

const props: ComponentProps<typeof GitPanel> = {
  open: true,
  sourceControl: {
    contextPath: '/repo',
    repo: null,
    status: null,
    changedCount: 2,
    upstream: 'origin/main',
    ahead: 2,
    behind: 0,
    hasRepo: true,
    isLoading: false,
    localError: null,
    busyAction: null,
    lastRemoteError: null,
    applyStatus: vi.fn(),
    refresh: vi.fn(() => Promise.resolve()),
    runRemoteAction: vi.fn(() => Promise.resolve({ ok: true })) as never,
  },
  onOpenDiff: vi.fn(),
  repositoryTarget: { mode: 'follow-context' },
  onFollowRepositoryContext: vi.fn(),
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  harness.scm = state();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = () => act(() => root.render(createElement(GitPanel, props)));
const byLabel = (label: string) => {
  const el = host.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`nothing labelled ${label}`);
  return el as HTMLElement;
};
const button = (name: string) => {
  const el = [...host.querySelectorAll('button')].find((b) => b.textContent === name);
  if (!el) throw new Error(`no ${name} button`);
  return el;
};

describe('the changes', () => {
  it('lists each file with its status letter, and the counts against the upstream', () => {
    render();
    const rows = [...host.querySelectorAll('[role="option"]')];
    expect(rows.map((r) => r.querySelector('.font-mono')?.textContent)).toEqual(['M', 'D']);
    expect(host.textContent).toContain('1 file staged');
    expect(host.textContent).toContain('↑2 origin/main');
  });

  it('stages, unstages and discards through the source control hooks', async () => {
    render();
    await act(async () => byLabel('Stage src/restore.ts').click());
    expect(harness.scm.toggleStageFile).toHaveBeenCalledWith(staged);
    await act(async () => byLabel('Stage vite.config.ts').click());
    expect(harness.scm.toggleStageFile).toHaveBeenCalledWith(unstaged);
    await act(async () => byLabel('Stage all changes').click());
    expect(harness.scm.toggleAll).toHaveBeenCalledTimes(1);
    // Only a file with unstaged changes offers discarding.
    expect(host.querySelector('[aria-label="Discard src/restore.ts"]')).toBeNull();
    await act(async () => byLabel('Discard vite.config.ts').click());
    expect(harness.scm.requestDiscardFile).toHaveBeenCalledWith(unstaged);
  });

  it('discards once the confirmation is accepted', async () => {
    harness.scm = state({ pendingDiscard: { scope: 'single', count: 1, label: 'vite.config.ts' } });
    render();
    const discard = [...document.querySelectorAll('[role="alertdialog"] button')].find(
      (b) => b.textContent === 'Discard',
    ) as HTMLElement;
    await act(async () => discard.click());
    expect(harness.scm.confirmPendingDiscard).toHaveBeenCalledTimes(1);
  });
});

describe('the commit box', () => {
  it('hands the typed message to the hook', () => {
    render();
    const textarea = byLabel('Commit message') as HTMLTextAreaElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea, 'fix: x');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(harness.scm.setCommitMessage).toHaveBeenCalledWith('fix: x');
  });

  it('commits the staged changes with a message', async () => {
    harness.scm = state({ commitMessage: 'fix: keep split ratios' });
    render();
    expect(button('Commit').getAttribute('aria-disabled')).toBe('false');
    await act(async () => button('Commit').click());
    expect(harness.scm.commit).toHaveBeenCalledTimes(1);
  });

  it('does not commit with an empty message', async () => {
    harness.scm = state({ commitMessage: '   ' });
    render();
    expect(button('Commit').getAttribute('aria-disabled')).toBe('true');
    await act(async () => button('Commit').click());
    expect(harness.scm.commit).not.toHaveBeenCalled();
  });

  it('pushes', async () => {
    render();
    await act(async () => button('Push').click());
    expect(harness.scm.push).toHaveBeenCalledTimes(1);
  });
});

describe('a fixed repository that does not load', () => {
  it.each(['no-repo', 'error'] as const)('offers following the active context again (%s)', async (panelState) => {
    harness.scm = state({ panelState });
    act(() =>
      root.render(
        createElement(GitPanel, {
          ...props,
          sourceControl: { ...props.sourceControl, contextPath: '/gone' },
          repositoryTarget: { mode: 'fixed', repoRoot: '/gone' },
        }),
      ),
    );
    await act(async () => button('Follow Active Context').click());
    expect(props.onFollowRepositoryContext).toHaveBeenCalled();
  });

  it('is not offered while following the active context', () => {
    harness.scm = state({ panelState: 'no-repo' });
    render();
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Follow Active Context')).toBe(false);
  });
});
