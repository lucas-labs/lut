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
  defaultWorkspaceEnv: 'local',
  terminalLetterSpacing: 0,
  terminalFontSize: 14,
  terminalScrollback: 10000,
  terminalScrollSpeed: 1,
  terminalMacOptionAsAlt: 'off',
  confirmCloseRunningTerminal: true,
  terminalPadding: { top: 0, right: 0, bottom: 0, left: 0 },
  terminalFullScreenFill: true,
  terminalFullScreenKeepPadding: ['claude'],
};
const prefs = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@/modules/settings/preferences', () => ({
  usePreferencesStore: (pick: (s: Record<string, unknown>) => unknown) => pick(prefs.state),
}));
const store = vi.hoisted(() => ({
  setTerminalSubpixelText: vi.fn(async (_enabled: boolean) => {}),
  setTerminalPadding: vi.fn(async (_padding: object) => {}),
  setTerminalFullScreenFill: vi.fn(async (_fill: boolean) => {}),
  setTerminalFullScreenKeepPadding: vi.fn(async (_programs: string[]) => {}),
}));
vi.mock('@/modules/settings/store', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...store,
}));
const native = vi.hoisted(() => {
  // A detected profile as `profiles_list` lists it.
  const detected = (id: string, name: string, hidden: boolean, executable?: string) => ({
    id,
    name,
    ...(executable ? { executable } : {}),
    args: [],
    env: {},
    loadUserProfile: true,
    environment: executable ? { kind: 'native' } : { kind: 'wsl', distro: name },
    appearance: {},
    tab: { allowShellTitle: true },
    closeBehavior: 'ask',
    source: 'detected',
    hidden,
  });
  return {
    profiles: {
      profiles: [
        detected('detected:pwsh', 'PowerShell', false, 'C:/pwsh.exe'),
        detected('detected:cmd', 'Command Prompt', true, 'C:/cmd.exe'),
        detected('detected:wsl:Ubuntu', 'Ubuntu', false),
      ],
      defaultProfileId: 'detected:pwsh' as string | null,
    },
    shells: [{ name: 'Command Prompt', path: 'C:/cmd.exe', integrated: false }],
    setDefault: vi.fn(async (_id: string) => {}),
    changed: null as null | (() => void),
  };
});
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: { id: string }) => {
    if (command === 'profiles_list') return Promise.resolve(structuredClone(native.profiles));
    if (command === 'profiles_set_default') return native.setDefault(args?.id ?? '');
    if (command === 'pty_list_shells') return Promise.resolve(native.shells);
    return Promise.resolve([]);
  },
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: (name: string, callback: () => void) => {
    if (name === 'lut:profiles-changed') native.changed = callback;
    return Promise.resolve(() => {});
  },
}));
const toasts = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toasts }));
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

beforeEach(async () => {
  store.setTerminalSubpixelText.mockClear();
  native.setDefault.mockReset();
  native.profiles.defaultProfileId = 'detected:pwsh';
  // The profiles list outlives each mount: read the reset one again.
  await act(async () => native.changed?.());
  toasts.error.mockClear();
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
const profileSelect = () => rowOf('Default profile')?.querySelector('[role="combobox"]') as HTMLElement;
const openProfiles = async () => {
  await act(async () => {
    profileSelect().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  return [...document.querySelectorAll('[role="option"]')] as HTMLElement[];
};
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
    expect(groupOf('Default profile')).toBe('Shell');
    expect(groupOf('Scrollback')).toBe('Scrolling & input');
  });

  it('names every switch, select and field by its row title', () => {
    render();
    const controls = host.querySelectorAll('[role="switch"], [role="combobox"], input');
    expect(controls.length).toBeGreaterThan(10);
    for (const control of controls) {
      // A field of a group of fields (the padding) is named by its own label inside the named group; one of a
      // list (the programs) by its own label.
      const named = control.closest('[role="group"][aria-labelledby]') ?? control;
      const name =
        document.getElementById(named.getAttribute('aria-labelledby') ?? '')?.textContent ??
        control.getAttribute('aria-label');
      expect(name, control.outerHTML).toBeTruthy();
    }
  });

  it('sets the padding of every pane, both sides of an axis at once (E14-21)', () => {
    render({ terminalPadding: { top: 4, right: 8, bottom: 4, left: 8 } });
    const row = rowOf('Padding');
    expect(groupOf('Padding')).toBe('Text');
    expect(row?.textContent).toContain('Space around the text in each pane (px).');
    const horizontal = row?.querySelector('input[aria-label="Horizontal padding"]') as HTMLInputElement;
    expect(horizontal.value).toBe('8');
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setValue?.call(horizontal, '12');
      horizontal.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(store.setTerminalPadding).toHaveBeenLastCalledWith({ top: 4, right: 12, bottom: 4, left: 12 });
  });

  it('lets full-screen programs fill the pane, except the programs listed', () => {
    render();
    const fill = rowOf('Full-screen programs fill the pane');
    expect(groupOf('Full-screen programs fill the pane')).toBe('Text');
    const body = host.querySelector('[data-slot="setting-expander-body"]');
    expect(body?.getAttribute('data-state')).toBe('open');
    const field = () => rowOf('Keep padding for')?.querySelector('input') as HTMLInputElement;
    expect(field().value).toBe('claude');

    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    act(() => {
      setValue?.call(field(), 'C:\\Tools\\NVim.exe');
      field().dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => field().dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(store.setTerminalFullScreenKeepPadding).toHaveBeenLastCalledWith(['nvim']);
    expect(field().value).toBe('nvim');

    act(() => (fill?.querySelector('button[role="switch"]') as HTMLButtonElement).click());
    expect(store.setTerminalFullScreenFill).toHaveBeenCalledWith(false);
    render({ terminalFullScreenFill: false });
    expect(host.querySelector('[data-slot="setting-expander-body"]')?.getAttribute('data-state')).toBe('closed');
  });

  it('sets the default profile from the visible profiles', async () => {
    render();
    await act(async () => {});
    expect(profileSelect().textContent).toBe('PowerShell');
    expect(rowOf('Default profile')?.textContent).toContain('Profile new terminal tabs open with.');
    const options = await openProfiles();
    expect(options.map((o) => o.textContent)).toEqual(['PowerShell', 'Ubuntu']);
    await act(async () => {
      options[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(native.setDefault).toHaveBeenCalledWith('detected:wsl:Ubuntu');
  });

  it('follows a default changed elsewhere and keeps a hidden default listed', async () => {
    render();
    await act(async () => {});
    native.profiles.defaultProfileId = 'detected:cmd';
    await act(async () => native.changed?.());
    expect(profileSelect().textContent).toBe('Command Prompt');
    // cmd has no shell integration.
    expect(rowOf('Default profile')?.textContent).toContain('directory tracking are unavailable');
    const options = await openProfiles();
    expect(options.map((o) => o.textContent)).toEqual(['PowerShell', 'Command Prompt', 'Ubuntu']);
  });

  it('says why the default could not be set', async () => {
    native.setDefault.mockRejectedValue({ kind: 'io', message: 'disk full' });
    render();
    await act(async () => {});
    const options = await openProfiles();
    await act(async () => {
      options[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(toasts.error).toHaveBeenCalledWith("Couldn't set the default profile", { description: 'disk full' });
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
