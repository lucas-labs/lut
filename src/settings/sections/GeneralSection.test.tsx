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
      sidebarMode: 'full',
      ephemeralSpace: { enabled: true, name: 'Scratch', color: null, folder: '' },
    }),
}));
const setEphemeralSpace = vi.hoisted(() => vi.fn(async () => undefined));
const setSidebarMode = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/modules/settings/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/settings/store')>()),
  setEphemeralSpace,
  setSidebarMode,
}));
vi.mock('@/modules/agents/lib/notify', () => ({ testAgentOsNotification: vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const openTab = vi.fn();

beforeEach(() => {
  theme.setMode.mockReset();
  setEphemeralSpace.mockClear();
  setSidebarMode.mockClear();
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

  it('groups the settings under their headings; the terminal ones have their own section', () => {
    const groups = [...host.querySelectorAll('section h2')].map((h) => h.textContent);
    expect(groups).toEqual(['Appearance', 'Layout', 'Zoom', 'Explorer', 'Agents', 'Startup']);
  });

  it('names every switch and select by its row title', () => {
    const controls = host.querySelectorAll('[role="switch"], [role="combobox"], input');
    expect(controls.length).toBeGreaterThan(5);
    for (const control of controls) {
      const name = document.getElementById(control.getAttribute('aria-labelledby') ?? '')?.textContent;
      expect(name, control.outerHTML).toBeTruthy();
    }
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
    expect(document.getElementById(zoom?.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('UI zoom level');
    expect(zoom?.closest('[data-slot="slider"]')?.parentElement?.textContent).toBe('125%');
  });

  it('hides the notification sound while agent notifications are off', () => {
    const sound = [...host.querySelectorAll('[data-slot="setting-row"]')].find((r) =>
      r.textContent?.startsWith('Notification sound'),
    );
    expect(sound?.getAttribute('data-variant')).toBe('nested');
    expect(sound?.closest('[data-slot="setting-expander-body"]')?.hasAttribute('inert')).toBe(true);
  });

  it('saves the ephemeral Space colour picked from its swatches (E16-15)', () => {
    const swatches = [...host.querySelectorAll('[data-slot="radio-group-swatch-item"]')];
    expect(swatches.map((s) => s.getAttribute('aria-label'))).toContain('Theme accent');
    const violet = swatches.find((s) => s.getAttribute('aria-label') === 'Violet') as HTMLElement;
    act(() => violet.click());
    expect(setEphemeralSpace).toHaveBeenCalledWith({ enabled: true, name: 'Scratch', color: 1, folder: '' });
  });

  it('switches the sidebar to the compact rail from the Layout group (E27-01)', async () => {
    const row = [...host.querySelectorAll('[data-slot="setting-row"]')].find(
      (r) => r.querySelector('.font-medium')?.textContent === 'Sidebar mode',
    );
    const select = row?.querySelector('[role="combobox"]') as HTMLElement;
    expect(select.textContent).toBe('Full');
    await act(async () => {
      select.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    const options = [...document.querySelectorAll('[role="option"]')] as HTMLElement[];
    expect(options.map((o) => o.textContent)).toEqual(['Full', 'Compact']);
    await act(async () => {
      options[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(setSidebarMode).toHaveBeenCalledWith('compact');
  });
});
