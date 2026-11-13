// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const branch = (name: string) => ({ name, kind: 'local', isHead: false, worktreePath: null });
const branchesOf: Record<string, ReturnType<typeof branch>[]> = {
  '/repo/a': [branch('only-in-a')],
  '/repo/b': [branch('only-in-b')],
};
const checkoutBranch = vi.fn(() => Promise.resolve());
vi.mock('@/modules/git', () => ({
  git: {
    listBranches: (root: string) => Promise.resolve({ branches: branchesOf[root] ?? [] }),
    checkoutBranch,
  },
}));

const { BranchDropdown } = await import('./SourceControlPanel');

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  checkoutBranch.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (repoRoot: string) =>
  act(() =>
    root.render(
      createElement(BranchDropdown, {
        repoRoot,
        repoLabel: 'main',
        displayRepoRoot: repoRoot,
        repositoryTarget: { mode: 'follow-context' },
        onFollowRepositoryContext: () => {},
        onRefresh: () => {},
      }),
    ),
  );
const items = () => [...document.querySelectorAll('[role="menuitem"]')].map((el) => el.textContent);

it('lists the new repository when its root changes while the menu is open', async () => {
  render('/repo/a');
  const trigger = host.querySelector('button');
  if (!trigger) throw new Error('no trigger');
  await act(async () => {
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
  });
  expect(items()).toEqual(['only-in-a']);
  render('/repo/b');
  await act(async () => {});
  expect(items()).toEqual(['only-in-b']);
  await act(async () => (document.querySelector('[role="menuitem"]') as HTMLElement).click());
  expect(checkoutBranch).toHaveBeenCalledWith('/repo/b', 'only-in-b');
});
