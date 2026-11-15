import { beforeEach, describe, expect, it, vi } from 'vitest';

// `store` is created at module load, so the plugin mock must be in place
// before `./store` is imported.
const entries = vi.hoisted(() => ({ value: [] as [string, unknown][] }));

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    entries = async () => entries.value;
    get = async () => undefined;
    set = async () => undefined;
    save = async () => undefined;
  },
  Store: class {},
}));
vi.mock('@tauri-apps/api/event', () => ({
  emit: async () => undefined,
  listen: async () => () => undefined,
}));

describe('terminalSubpixelText', () => {
  beforeEach(() => {
    entries.value = [];
    vi.resetModules();
  });

  it('is off when nothing is stored, or anything but true', async () => {
    const { loadPreferences } = await import('./store');
    expect((await loadPreferences()).terminalSubpixelText).toBe(false);

    vi.resetModules();
    entries.value = [['terminalSubpixelText', 'rgb']];
    const again = await import('./store');
    expect((await again.loadPreferences()).terminalSubpixelText).toBe(false);
  });

  it('reads a stored choice', async () => {
    entries.value = [['terminalSubpixelText', true]];
    const { loadPreferences } = await import('./store');
    expect((await loadPreferences()).terminalSubpixelText).toBe(true);
  });
});
