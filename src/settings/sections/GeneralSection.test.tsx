// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneralSection } from './GeneralSection';

const theme = vi.hoisted(() => ({ mode: 'dark', setMode: vi.fn() }));
vi.mock('@/modules/theme', () => ({
  useTheme: () => ({
    mode: theme.mode,
    setMode: theme.setMode,
    activeTheme: {
      id: 'lut',
      name: 'lut',
      variants: { dark: { colors: { background: '#000000' } }, light: { colors: { background: '#ffffff' } } },
    },
  }),
}));
vi.mock('@/modules/settings/preferences', () => ({
  usePreferencesStore: (pick: (s: Record<string, unknown>) => unknown) =>
    pick({
      zoomLevel: 1.25,
      fileIconColors: 'theme',
      terminalRenderer: 'auto',
      terminalCursorStyle: 'bar',
      terminalFontFamily: '',
      terminalFontWeight: 'normal',
      terminalShell: '',
      defaultWorkspaceEnv: 'local',
      terminalLetterSpacing: 0,
      terminalFontSize: 14,
      terminalScrollback: 10000,
      terminalScrollSpeed: 1,
      terminalMacOptionAsAlt: 'off',
    }),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: () => Promise.resolve([]) }));
vi.mock('@/modules/agents/lib/notify', () => ({ testAgentOsNotification: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const openTab = vi.fn();

beforeEach(() => {
  theme.setMode.mockReset();
  openTab.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(createElement(GeneralSection, { openTab })));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const button = (name: string) => {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
  if (!found) throw new Error(`no ${name} button`);
  return found;
};

describe('GeneralSection', () => {
  it('marks the current mode and picks another one', () => {
    expect(button('Dark').getAttribute('aria-pressed')).toBe('true');
    expect(button('Light').getAttribute('aria-pressed')).toBe('false');
    act(() => button('System').click());
    expect(theme.setMode).toHaveBeenCalledWith('system');
  });

  it('draws each mode in its own colours, whatever the current mode', () => {
    // A theme that leaves its colours to the stylesheet (lut's) gets them from the mode class.
    expect(button('Light').querySelector('.light')).not.toBeNull();
    expect(button('Dark').querySelector('.dark')).not.toBeNull();
    expect(button('System').querySelector('.light + .dark')).not.toBeNull();
  });

  it('opens the Themes section from the note under the modes', () => {
    act(() => button('Themes').click());
    expect(openTab).toHaveBeenCalledWith('themes');
  });

  it('shows the zoom level next to its slider', () => {
    const zoom = host.querySelector('[role="slider"]');
    expect(zoom?.getAttribute('aria-label')).toBe('UI zoom level');
    expect(zoom?.closest('[data-slot="slider"]')?.parentElement?.textContent).toBe('125%');
  });
});
