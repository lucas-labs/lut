import { describe, expect, it, vi } from 'vitest';

// `./store` creates its LazyStore at module load; the plugins must be mocked first.
vi.mock('@tauri-apps/plugin-store', () => ({ LazyStore: class {}, Store: class {} }));
vi.mock('@tauri-apps/api/event', () => ({
  emit: async () => undefined,
  listen: async () => () => undefined,
}));

const { coerceEphemeralSpace, DEFAULT_PREFERENCES } = await import('./store');

describe('the ephemeral Space preference (E16-15)', () => {
  it('is on by default, named "Ephemeral", with no colour and no folder', () => {
    expect(DEFAULT_PREFERENCES.ephemeralSpace).toEqual({
      enabled: true,
      name: 'Ephemeral',
      color: null,
      folder: '',
    });
  });

  it('loads the default when none is saved, or what is saved is not an object', () => {
    for (const saved of [undefined, null, true, 'on']) {
      expect(coerceEphemeralSpace(saved)).toEqual(DEFAULT_PREFERENCES.ephemeralSpace);
    }
  });

  it('keeps each field of the right type and defaults the others', () => {
    expect(
      coerceEphemeralSpace({ enabled: false, name: '  Scratch ', color: 3, folder: ' C:/work ' }),
    ).toEqual({
      enabled: false,
      name: 'Scratch',
      color: 3,
      folder: 'C:/work',
    });
    expect(coerceEphemeralSpace({ enabled: 'no', name: '   ', color: -1, folder: 7 })).toEqual(
      DEFAULT_PREFERENCES.ephemeralSpace,
    );
    expect(coerceEphemeralSpace({ color: 1.5 }).color).toBeNull();
  });
});
