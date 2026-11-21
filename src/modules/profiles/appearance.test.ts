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
    });
  });

  it('keeps the global value of every field the profile leaves unset', () => {
    const global = { ...DEFAULT_PREFERENCES, terminalFontSize: 13, terminalCursorBlink: false };
    const resolved = resolvePreferences(global, profileLayer({ fontFamily: 'Iosevka' }));
    expect(resolved).toEqual({ ...global, terminalFontFamily: 'Iosevka' });
  });
});
