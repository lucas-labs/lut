// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalSection } from './TerminalSection';

const defaults = {
  terminalRenderer: 'auto',
  terminalSubpixelText: false,
  terminalScreenReader: false,
  terminalCursorBlink: true,
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
  confirmCloseRunningTerminal: true,
};
const prefs = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@/modules/settings/preferences', () => ({
  usePreferencesStore: (pick: (s: Record<string, unknown>) => unknown) => pick(prefs.state),
}));
const store = vi.hoisted(() => ({
  setTerminalSubpixelText: vi.fn(async (_enabled: boolean) => {}),
}));
vi.mock('@/modules/settings/store', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...store,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: () => Promise.resolve([]) }));
const subpixel = vi.hoisted(() => ({
  unavailable: vi.fn(async (_renderer: string): Promise<string | null> => null),
}));
vi.mock('@/modules/terminal/ghostty/gpu/subpixelText', () => ({
  subpixelTextUnavailable: subpixel.unavailable,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

// The mocked store does not notify its readers, so each state is a fresh mount.
const render = (state: Partial<typeof defaults> = {}) => {
  prefs.state = { ...defaults, ...state };
  act(() => root.unmount());
  root = createRoot(host);
  act(() => root.render(createElement(TerminalSection)));
};

beforeEach(() => {
  store.setTerminalSubpixelText.mockClear();
  subpixel.unavailable.mockReset();
  subpixel.unavailable.mockResolvedValue(null);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const rowOf = (title: string) =>
  [...host.querySelectorAll('[data-slot="setting-row"]')].find(
    (r) => r.querySelector('.font-medium')?.textContent === title,
  );
const groupOf = (title: string) => rowOf(title)?.closest('section')?.querySelector('h2')?.textContent;
const subpixelToggle = () => rowOf('Subpixel text')?.querySelector('button[role="switch"]') as HTMLButtonElement;

describe('TerminalSection', () => {
  it('groups the terminal settings', () => {
    render();
    const groups = [...host.querySelectorAll('section h2')].map((h) => h.textContent);
    expect(groups).toEqual(['Rendering', 'Text', 'Cursor', 'Shell', 'Scrolling & input']);
    expect(groupOf('Terminal renderer')).toBe('Rendering');
    expect(groupOf('Subpixel text')).toBe('Rendering');
    expect(groupOf('Font family')).toBe('Text');
    expect(groupOf('Cursor style')).toBe('Cursor');
    expect(groupOf('Integrated terminal shell')).toBe('Shell');
    expect(groupOf('Scrollback')).toBe('Scrolling & input');
  });

  it('names every switch, select and field by its row title', () => {
    render();
    const controls = host.querySelectorAll('[role="switch"], [role="combobox"], input');
    expect(controls.length).toBeGreaterThan(10);
    for (const control of controls) {
      const name = document.getElementById(control.getAttribute('aria-labelledby') ?? '')?.textContent;
      expect(name, control.outerHTML).toBeTruthy();
    }
  });

  it('turns subpixel text on and off where it can be drawn', async () => {
    render();
    // Off, it cannot be turned on until the GPU answers.
    expect(subpixelToggle().disabled).toBe(true);
    await act(async () => {});
    expect(subpixel.unavailable).toHaveBeenCalledWith('auto');
    expect(subpixelToggle().disabled).toBe(false);
    expect(subpixelToggle().getAttribute('aria-checked')).toBe('false');
    act(() => subpixelToggle().click());
    expect(store.setTerminalSubpixelText).toHaveBeenCalledWith(true);

    render({ terminalSubpixelText: true });
    await act(async () => {});
    expect(subpixelToggle().getAttribute('aria-checked')).toBe('true');
    act(() => subpixelToggle().click());
    expect(store.setTerminalSubpixelText).toHaveBeenLastCalledWith(false);
  });

  it('disables subpixel text and says why where it cannot be drawn', async () => {
    subpixel.unavailable.mockResolvedValue('Not available with the WebGL renderer.');
    render({ terminalRenderer: 'webgl' });
    await act(async () => {});
    expect(subpixel.unavailable).toHaveBeenCalledWith('webgl');
    expect(subpixelToggle().disabled).toBe(true);
    expect(subpixelToggle().getAttribute('aria-checked')).toBe('false');
    expect(rowOf('Subpixel text')?.textContent).toContain('Not available with the WebGL renderer.');
  });

  it('still lets an enabled preference be turned off where it cannot be drawn', async () => {
    // Terminals opened with WebGPU before the renderer changed still draw it.
    subpixel.unavailable.mockResolvedValue('Not available with the WebGL renderer.');
    render({ terminalSubpixelText: true, terminalRenderer: 'webgl' });
    await act(async () => {});
    expect(subpixelToggle().disabled).toBe(false);
    expect(subpixelToggle().getAttribute('aria-checked')).toBe('true');
    expect(rowOf('Subpixel text')?.textContent).toContain('Not available with the WebGL renderer.');
    act(() => subpixelToggle().click());
    expect(store.setTerminalSubpixelText).toHaveBeenCalledWith(false);
  });
});
