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
