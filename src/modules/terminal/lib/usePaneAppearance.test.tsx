// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaneAppearance } from './usePaneAppearance';

vi.mock('@tauri-apps/plugin-store', () => ({ LazyStore: class {}, Store: class {} }));
vi.mock('@tauri-apps/api/event', () => ({
  emit: async () => undefined,
  listen: async () => () => undefined,
}));

const state = vi.hoisted(() => ({
  /** What `useProfileAppearance` answers: `null` while the profiles are read. */
  profile: null as object | undefined | null,
  theme: { resolvedMode: 'dark', activeTheme: { id: 'lut', name: 'Lut', variants: {} } as object },
}));
vi.mock('@/modules/profiles', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useProfileAppearance: () => state.profile,
}));
vi.mock('@/modules/theme', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTheme: () => ({ ...state.theme, customThemes: [] }),
  // Which theme and mode each pane's colours come from.
  terminalTokensFor: (theme: { id: string }, mode: string) => ({ background: `${theme.id}/${mode}` }),
}));
vi.mock('@/modules/terminal/ghostty/gpu/terminalVisuals', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  terminalGpuTheme: (tokens: object) => tokens,
}));

const { usePaneAppearance } = await import('./usePaneAppearance');
const { usePreferencesStore } = await import('@/modules/settings/preferences');

let root: Root;
const seen = { current: null as PaneAppearance | null };

function Probe() {
  const appearance = usePaneAppearance('mine');
  useEffect(() => {
    seen.current = appearance;
  });
  return null;
}

async function resolve(profile: object | undefined | null, mode = 'dark') {
  state.profile = profile;
  state.theme = { ...state.theme, resolvedMode: mode };
  await act(async () => root.render(<Probe />));
  return seen.current;
}

const background = (appearance: PaneAppearance | null) =>
  (appearance?.theme as unknown as { background: string } | undefined)?.background;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  usePreferencesStore.setState({
    terminalFontFamily: 'Global Mono',
    terminalFontSize: 13,
    terminalFontWeight: '400',
    terminalCursorStyle: 'bar',
    terminalCursorBlink: false,
    terminalScrollback: 5000,
    terminalPadding: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  root = createRoot(document.createElement('div'));
});
afterEach(async () => {
  await act(async () => root.unmount());
});

describe("a pane's appearance", () => {
  it('is unknown while the profiles are read', async () => {
    expect(await resolve(null)).toBeNull();
  });

  it("is the global one, in the app's theme, for a profile that sets nothing or is not listed", async () => {
    for (const profile of [{}, undefined]) {
      const appearance = await resolve(profile);
      expect(background(appearance)).toBe('lut/dark');
      expect(appearance).toMatchObject({
        font: { fontFamily: 'Global Mono', fontSize: 13, fontWeight: '400' },
        cursorStyle: 'bar',
        cursorBlink: false,
        scrollback: 5000,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
      });
    }
  });

  it("shows the profile's theme in the app's mode", async () => {
    expect(background(await resolve({ themeId: 'dracula' }, 'light'))).toBe('dracula/light');
  });

  it("follows the app's theme when the profile's theme no longer exists", async () => {
    expect(background(await resolve({ themeId: 'gone' }))).toBe('lut/dark');
  });

  it("takes the profile's font, cursor and scrollback, and keeps the global font apart", async () => {
    const appearance = await resolve({
      fontFamily: 'Profile Mono',
      fontSize: 18,
      cursorStyle: 'block',
      cursorBlink: true,
      scrollback: 100,
      padding: { top: 6, right: 6, bottom: 6, left: 6 },
    });
    expect(appearance).toMatchObject({
      font: { fontFamily: 'Profile Mono', fontSize: 18, fontWeight: '400' },
      globalFont: { fontFamily: 'Global Mono', fontSize: 13, fontWeight: '400' },
      cursorStyle: 'block',
      cursorBlink: true,
      scrollback: 100,
      padding: { top: 6, right: 6, bottom: 6, left: 6 },
    });
  });
});
