// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

const { useProfilesLoadNotice } = await import('./useProfilesLoadNotice');

let root: Root;

function Host() {
  useProfilesLoadNotice();
  return null;
}

async function mount() {
  await act(async () => {
    root.render(createElement(Host));
  });
}

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.toastError.mockReset();
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
});

describe('useProfilesLoadNotice', () => {
  it('stays quiet when the profiles loaded', async () => {
    mocks.invoke.mockResolvedValue(null);
    await mount();
    expect(mocks.invoke).toHaveBeenCalledWith('profiles_take_load_error');
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('names the backup when the file was moved aside', async () => {
    mocks.invoke.mockResolvedValue({ backupPath: 'C:/cfg/profiles.corrupt-1.json', reason: 'bad json' });
    await mount();
    expect(mocks.toastError).toHaveBeenCalledOnce();
    expect(mocks.toastError.mock.calls[0][1].description).toContain('C:/cfg/profiles.corrupt-1.json');
    expect(mocks.toastError.mock.calls[0][1].duration).toBe(Infinity);
  });

  it('gives the reason when the file could not be read', async () => {
    mocks.invoke.mockResolvedValue({ backupPath: '', reason: 'access denied' });
    await mount();
    expect(mocks.toastError.mock.calls[0][1].description).toContain('access denied');
  });

  it('stays quiet when the command fails', async () => {
    mocks.invoke.mockRejectedValue(new Error('no backend'));
    await mount();
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});
