import { describe, expect, it, vi } from 'vitest';

// `settings/store` creates its LazyStore at module load; the plugins must be mocked first.
vi.mock('@tauri-apps/plugin-store', () => ({ LazyStore: class {}, Store: class {} }));
vi.mock('@tauri-apps/api/event', () => ({
  emit: async () => undefined,
  listen: async () => () => undefined,
}));

const { DEFAULT_PREFERENCES } = await import('@/modules/settings/store');
const { resolvePreferences } = await import('@/modules/settings/resolvePreferences');
const { profileLayer } = await import('./appearance');

describe('a profile appearance over the global preferences', () => {
  it('replaces each appearance preference the profile sets', () => {
    const resolved = resolvePreferences(
      DEFAULT_PREFERENCES,
      profileLayer({
        themeId: 'dracula',
        fontFamily: 'Iosevka',
        fontSize: 16,
        fontWeight: '500',
        cursorStyle: 'underline',
        cursorBlink: true,
        scrollback: 2000,
        padding: { top: 2, right: 6, bottom: 2, left: 6 },
      }),
    );
    expect(resolved).toMatchObject({
      themeId: 'dracula',
      terminalFontFamily: 'Iosevka',
      terminalFontSize: 16,
      terminalFontWeight: '500',
      terminalCursorStyle: 'underline',
      terminalCursorBlink: true,
      terminalScrollback: 2000,
      terminalPadding: { top: 2, right: 6, bottom: 2, left: 6 },
    });
  });

  it('keeps a profile padding whole numbers from 0 to the most Settings offers', () => {
    const resolved = resolvePreferences(
      DEFAULT_PREFERENCES,
      profileLayer({ padding: { top: -4, right: 3.6, bottom: 500, left: 10 } }),
    );
    expect(resolved.terminalPadding).toEqual({ top: 0, right: 4, bottom: 64, left: 10 });
  });

  it('keeps the global value of every field the profile leaves unset', () => {
    const global = { ...DEFAULT_PREFERENCES, terminalFontSize: 13, terminalCursorBlink: false };
    const resolved = resolvePreferences(global, profileLayer({ fontFamily: 'Iosevka' }));
    expect(resolved).toEqual({ ...global, terminalFontFamily: 'Iosevka' });
  });
});
