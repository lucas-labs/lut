import { describe, expect, it, vi } from 'vitest';

// `./store` creates its LazyStore at module load; the plugins must be mocked first.
vi.mock('@tauri-apps/plugin-store', () => ({ LazyStore: class {}, Store: class {} }));
vi.mock('@tauri-apps/api/event', () => ({
  emit: async () => undefined,
  listen: async () => () => undefined,
}));

const { coerceTerminalPadding, DEFAULT_PREFERENCES } = await import('./store');

describe('the terminal padding preference', () => {
  it('is 10 px above and below the text and 14 px beside it by default', () => {
    expect(DEFAULT_PREFERENCES.terminalPadding).toEqual({
      top: 10,
      right: 14,
      bottom: 10,
      left: 14,
    });
  });

  it('loads the default when none is saved, or what is saved is not a padding', () => {
    for (const saved of [undefined, null, 8, 'wide']) {
      expect(coerceTerminalPadding(saved)).toEqual(DEFAULT_PREFERENCES.terminalPadding);
    }
  });

  it('keeps each side a whole number of pixels from 0 to 64, and a side that is not a number at 0', () => {
    expect(coerceTerminalPadding({ top: 0, right: 0, bottom: 0, left: 0 })).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
    expect(coerceTerminalPadding({ top: -2, right: 4.4, bottom: 90, left: 'x' })).toEqual({
      top: 0,
      right: 4,
      bottom: 64,
      left: 0,
    });
  });
});
