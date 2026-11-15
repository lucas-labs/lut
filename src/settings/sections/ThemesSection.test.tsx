// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemesSection } from './ThemesSection';

const builtin = vi.hoisted(() => [
  { id: 'lut', name: 'lut', description: 'The default.', variants: { dark: { colors: {} } } },
]);
const custom = vi.hoisted(() => [{ id: 'mine', name: 'Mine', variants: { dark: { colors: {} } } }]);
const theme = vi.hoisted(() => ({ setThemeId: vi.fn() }));
vi.mock('@/modules/theme', () => ({
  useTheme: () => ({ themeId: 'lut', setThemeId: theme.setThemeId, resolvedMode: 'dark', customThemes: custom }),
}));
vi.mock('@/modules/theme/themes', () => ({ listBuiltinThemes: () => builtin }));
vi.mock('@/modules/theme/themeFiles', () => ({ deleteThemeFile: vi.fn(), handOffThemeEdit: vi.fn() }));
vi.mock('@/modules/theme/customThemes', () => ({ deleteCustomTheme: vi.fn(), saveCustomTheme: vi.fn() }));
vi.mock('@/modules/theme/bgImageStore', () => ({
  deleteBgImage: vi.fn(),
  getBgImage: vi.fn(),
  importBgImageFromFile: vi.fn(),
}));
vi.mock('@/modules/theme/vibrancy', () => ({ getBackdropKind: async () => 'none' }));
vi.mock('@/modules/platform', () => ({ closeWindow: vi.fn() }));
vi.mock('@/modules/settings/preferences', () => ({
  usePreferencesStore: (pick: (s: Record<string, unknown>) => unknown) =>
    pick({ editorTheme: 'auto', backgroundKind: 'none', backgroundImageId: null, windowVibrancy: false }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => {
    root.render(createElement(ThemesSection));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const card = (name: string) => {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) =>
    b.textContent?.startsWith(name),
  );
  if (!found) throw new Error(`no ${name} card`);
  return found;
};

beforeEach(() => {
  theme.setThemeId.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('ThemesSection', () => {
  it('marks the active theme and picks another one', async () => {
    await render();
    expect(card('lut').getAttribute('aria-pressed')).toBe('true');
    expect(card('Mine').getAttribute('aria-pressed')).toBe('false');
    act(() => card('Mine').click());
    expect(theme.setThemeId).toHaveBeenCalledWith('mine');
  });

  it('gives custom themes edit and remove buttons outside the card button', async () => {
    await render();
    for (const label of ['Edit Mine', 'Remove Mine']) {
      const action = host.querySelector(`button[aria-label="${label}"]`);
      expect(action).not.toBeNull();
      expect(action?.parentElement?.closest('button')).toBeNull();
    }
    expect(host.querySelector('button[aria-label="Edit lut"]')).toBeNull();
    expect(host.querySelector('[role="button"]')).toBeNull();
  });
});
