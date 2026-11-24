import { describe, expect, it, vi } from 'vitest';

// `./store` creates its LazyStore at module load; the plugins must be mocked first.
vi.mock('@tauri-apps/plugin-store', () => ({ LazyStore: class {}, Store: class {} }));
vi.mock('@tauri-apps/api/event', () => ({
  emit: async () => undefined,
  listen: async () => () => undefined,
}));

const { coerceProgramNames, DEFAULT_PREFERENCES } = await import('./store');

describe('the full-screen padding preferences', () => {
  it('drop the padding for full-screen programs by default, except for claude', () => {
    expect(DEFAULT_PREFERENCES.terminalFullScreenFill).toBe(true);
    expect(DEFAULT_PREFERENCES.terminalFullScreenKeepPadding).toEqual(['claude']);
  });

  it('load the default list when none is saved, or what is saved is not a list', () => {
    for (const saved of [undefined, null, 'claude', { claude: true }]) {
      expect(coerceProgramNames(saved, ['claude'])).toEqual(['claude']);
    }
  });

  it('keep each saved name once, as the backend names programs, and nothing else', () => {
    expect(coerceProgramNames(['NVim.exe', 'nvim', '', 3, '/usr/bin/htop'], ['claude'])).toEqual([
      'nvim',
      'htop',
    ]);
    expect(coerceProgramNames([], ['claude'])).toEqual([]);
  });
});
