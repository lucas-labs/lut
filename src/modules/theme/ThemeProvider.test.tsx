// @vitest-environment happy-dom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider, useTheme } from './ThemeProvider';
import type { Theme } from './types';

// The stored preferences and custom themes come from Tauri stores; the tests set them here.
const stored = vi.hoisted(() => ({ themeId: 'lut', custom: [] as Theme[] }));
vi.mock('@/modules/settings/store', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadPreferences: async () => ({ theme: 'dark', themeId: stored.themeId }),
  onPreferencesChange: async () => () => {},
  setTheme: async () => {},
  setThemeId: async () => {},
}));
vi.mock('./customThemes', () => ({
  listCustomThemes: async () => stored.custom,
  onCustomThemesChange: async () => () => {},
}));
vi.mock('./SurfaceLayer', () => ({ SurfaceLayer: () => null }));

let state: ReturnType<typeof useTheme> | null = null;
function Probe() {
  const theme = useTheme();
  useEffect(() => {
    state = theme;
  });
  return null;
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
  stored.themeId = 'lut';
  stored.custom = [];
  state = null;
  host = document.createElement('div');
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
});

async function mount() {
  await act(async () => {
    root.render(createElement(ThemeProvider, null, createElement(Probe)));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  if (!state) throw new Error('ThemeProvider did not render');
  return state;
}

describe('ThemeProvider', () => {
  it('reports the default theme as selected when the stored id matches no theme', async () => {
    stored.themeId = 'lut-default';
    const theme = await mount();
    expect(theme.themeId).toBe('lut');
    expect(theme.activeTheme.id).toBe('lut');
  });

  it('reports a stored custom theme once the custom themes have loaded', async () => {
    stored.themeId = 'my-theme';
    stored.custom = [{ id: 'my-theme', name: 'Mine', variants: { dark: { colors: { background: '#101010' } } } }];
    const theme = await mount();
    expect(theme.themeId).toBe('my-theme');
    expect(theme.activeTheme.id).toBe('my-theme');
  });
});
