import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@/modules/workspace', () => ({
  currentWorkspaceEnv: () => ({ kind: 'local' }),
}));

import { git } from './api';

const workspace = { kind: 'local' };

describe('git api argument shapes', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValue(undefined);
  });

  it('keeps the legacy push call and adds the set-upstream option', async () => {
    await git.push('/r');
    expect(mocks.invoke).toHaveBeenLastCalledWith('git_push', {
      repoRoot: '/r',
      setUpstream: null,
      workspace,
    });
    await git.push('/r', { setUpstream: true });
    expect(mocks.invoke).toHaveBeenLastCalledWith('git_push', {
      repoRoot: '/r',
      setUpstream: true,
      workspace,
    });
  });

  it('releases a watch by the key watch returned and sends nothing else', async () => {
    await git.unwatch('/repo');
    expect(mocks.invoke).toHaveBeenLastCalledWith('git_unwatch', {
      repo: '/repo',
    });
  });
});
