// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));

const LIST = { profiles: [], defaultProfileId: null };
const STAYS = {
  id: 'stays',
  name: 'Stays',
  args: [],
  env: {},
  loadUserProfile: true,
  environment: { kind: 'native' },
  appearance: {},
  tab: { allowShellTitle: true },
  closeBehavior: 'keepOpen',
  source: 'custom',
  hidden: false,
};

let roots: Root[] = [];

/** Mounts `copies` components that call `useProfiles` at once; answers what the last one saw. */
async function mountWith(useProfiles: () => unknown, copies = 1) {
  const seen: unknown[] = [];
  function Host() {
    seen.push(useProfiles());
    return null;
  }
  const root = createRoot(document.createElement('div'));
  roots.push(root);
  await act(async () => {
    root.render(Array.from({ length: copies }, (_, key) => createElement(Host, { key })));
  });
  return () => seen[seen.length - 1];
}

beforeEach(() => {
  vi.resetModules();
  mocks.invoke.mockReset();
  mocks.listen.mockReset().mockResolvedValue(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  roots = [];
  vi.restoreAllMocks();
});

describe('useProfiles', () => {
  it('reads the list again on the next mount when the first read failed', async () => {
    const { useProfiles } = await import('./store');
    mocks.invoke.mockRejectedValueOnce(new Error('not ready')).mockResolvedValue(LIST);

    const first = await mountWith(useProfiles);
    expect(first()).toBeNull();

    const second = await mountWith(useProfiles);
    expect(second()).toEqual(LIST);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.listen).toHaveBeenCalledOnce();
  });

  it('shares one read among panes that mount together', async () => {
    const { useProfiles } = await import('./store');
    mocks.invoke.mockResolvedValue(LIST);

    await mountWith(useProfiles, 3);
    expect(mocks.invoke).toHaveBeenCalledOnce();

    await mountWith(useProfiles);
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });

  it('reads the list again once a failed subscription succeeds', async () => {
    const { useProfiles } = await import('./store');
    mocks.listen.mockRejectedValueOnce(new Error('no events'));
    mocks.invoke.mockResolvedValueOnce(LIST).mockResolvedValue({ ...LIST, defaultProfileId: 'new' });

    const first = await mountWith(useProfiles);
    expect(first()).toEqual(LIST);

    const second = await mountWith(useProfiles);
    expect(mocks.listen).toHaveBeenCalledTimes(2);
    expect(second()).toEqual({ ...LIST, defaultProfileId: 'new' });
  });
});

describe('useProfilesRead', () => {
  it('tells a failed read, and reads again on request', async () => {
    const { readProfilesAgain, useProfilesRead } = await import('./store');
    let answer: (list: unknown) => void = () => {};
    mocks.invoke
      .mockRejectedValueOnce(new Error('not ready'))
      .mockReturnValue(new Promise((resolve) => (answer = resolve)));

    const read = await mountWith(useProfilesRead);
    expect(read()).toBe('failed');

    await act(async () => readProfilesAgain());
    expect(read()).toBe('reading');
    await act(async () => answer(LIST));
    expect(read()).toBe('listed');
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
  });

  it('does not read a listed list again on request', async () => {
    const { readProfilesAgain, useProfilesRead } = await import('./store');
    mocks.invoke.mockResolvedValue(LIST);

    const read = await mountWith(useProfilesRead);
    expect(read()).toBe('listed');
    await act(async () => readProfilesAgain());
    expect(mocks.invoke).toHaveBeenCalledOnce();
  });
});

describe('useCloseBehavior', () => {
  it('is unknown while the first read runs, then follows the profile', async () => {
    const { useCloseBehavior } = await import('./store');
    let answer: (list: unknown) => void = () => {};
    mocks.invoke.mockReturnValue(new Promise((resolve) => (answer = resolve)));

    const stays = await mountWith(() => useCloseBehavior('stays'));
    const missing = await mountWith(() => useCloseBehavior('missing'));
    expect(stays()).toBeNull();

    await act(async () => answer({ profiles: [STAYS], defaultProfileId: 'stays' }));
    expect(stays()).toBe('keepOpen');
    expect(missing()).toBe('close');
  });

  it('closes when the list could not be read', async () => {
    const { useCloseBehavior } = await import('./store');
    mocks.invoke.mockRejectedValue(new Error('not ready'));

    const stays = await mountWith(() => useCloseBehavior('stays'));
    expect(stays()).toBe('close');
  });
});
