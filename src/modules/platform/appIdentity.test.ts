import { beforeEach, describe, expect, it, vi } from 'vitest';

const getIdentifier = vi.hoisted(() => vi.fn<() => Promise<string>>());
vi.mock('@tauri-apps/api/app', () => ({ getIdentifier }));

/** A fresh module per test: the name is asked once and kept. */
const load = async () => (await import('./appIdentity')).appName;

beforeEach(() => {
  vi.resetModules();
  getIdentifier.mockReset();
});

describe('appName (E25-10)', () => {
  it('says lut (dev) for the dev identity, whatever mode the frontend was built in', async () => {
    getIdentifier.mockResolvedValue('dev.lucode.lut.dev');
    expect(await (await load())()).toBe('lut (dev)');
  });

  it('says lut for the product identity, and when the identifier cannot be read', async () => {
    getIdentifier.mockResolvedValue('dev.lucode.lut');
    expect(await (await load())()).toBe('lut');
    vi.resetModules();
    getIdentifier.mockRejectedValue(new Error('no tauri'));
    expect(await (await load())()).toBe('lut');
  });

  it('asks the app once', async () => {
    getIdentifier.mockResolvedValue('dev.lucode.lut');
    const appName = await load();
    await appName();
    await appName();
    expect(getIdentifier).toHaveBeenCalledTimes(1);
  });
});
