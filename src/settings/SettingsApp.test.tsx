// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsApp } from './SettingsApp';

const tabEvent = vi.hoisted(() => ({ handler: null as ((e: { payload: string }) => void) | null }));
vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({
    listen: (_name: string, handler: (e: { payload: string }) => void) => {
      tabEvent.handler = handler;
      return Promise.resolve(() => {});
    },
  }),
}));
vi.mock('@/modules/settings/preferences', () => ({
  usePreferencesStore: (pick: (s: { init: () => Promise<void> }) => unknown) => pick({ init: async () => {} }),
}));
vi.mock('@/modules/theme', () => ({ WindowActivityBridge: () => null, WindowVibrancyBridge: () => null }));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('@/components/WindowControls', () => ({ WindowControls: () => null }));
vi.mock('./sections/GeneralSection', () => ({
  GeneralSection: ({ openTab }: { openTab: (tab: string) => void }) =>
    createElement(
      'p',
      null,
      'general section',
      createElement('button', { type: 'button', 'aria-label': 'Open Themes', onClick: () => openTab('themes') }),
    ),
}));
vi.mock('./sections/TerminalSection', () => ({
  TerminalSection: () => createElement('p', null, 'terminal section'),
}));
vi.mock('./sections/EditorSection', () => ({ EditorSection: () => createElement('p', null, 'editor section') }));
vi.mock('./sections/ThemesSection', () => ({ ThemesSection: () => createElement('p', null, 'themes section') }));
vi.mock('./sections/ShortcutsSection', () => ({
  ShortcutsSection: () => createElement('p', null, 'shortcuts section'),
}));
vi.mock('./sections/AboutSection', () => ({ AboutSection: () => createElement('p', null, 'about section') }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function open(search: string) {
  window.history.replaceState(null, '', `/settings.html${search}`);
  act(() => root.render(createElement(SettingsApp)));
}

const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const panel = () => host.querySelector('[role="tabpanel"]:not([hidden])');
const shown = () => panel()?.textContent;
const selected = () => tabs().find((t) => t.getAttribute('aria-selected') === 'true')?.textContent;

function tab(label: string): HTMLButtonElement {
  const found = tabs().find((t) => t.textContent === label);
  if (!found) throw new Error(`no ${label} tab`);
  return found;
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('SettingsApp', () => {
  it('lists every section as a vertical tab', () => {
    open('');
    const list = host.querySelector('[role="tablist"]');
    expect(list?.getAttribute('aria-label')).toBe('Settings sections');
    expect(list?.getAttribute('aria-orientation')).toBe('vertical');
    expect(tabs().map((t) => t.textContent)).toEqual(['General', 'Terminal', 'Editor', 'Themes', 'Shortcuts', 'About']);
  });

  it('shows the selected section in a panel labelled by its tab', () => {
    open('?tab=themes');
    const themes = tab('Themes');
    expect(themes.getAttribute('aria-controls')).toBe(panel()?.id);
    expect(panel()?.getAttribute('aria-labelledby')).toBe(themes.id);
    expect(host.querySelectorAll('[role="tabpanel"]:not([hidden])')).toHaveLength(1);
  });

  it('opens the section a deep link names', () => {
    open('?tab=shortcuts');
    expect(shown()).toBe('shortcuts section');
    expect(selected()).toBe('Shortcuts');
  });

  it('falls back to general for an unknown section', () => {
    open('?tab=models');
    expect(shown()).toBe('general section');
    expect(selected()).toBe('General');
  });

  it('switches section on click', () => {
    open('');
    act(() => {
      tab('Themes').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });
    expect(shown()).toBe('themes section');
    expect(selected()).toBe('Themes');
  });

  it('moves to the next section with the down arrow', async () => {
    open('');
    act(() => tab('General').focus());
    await act(async () => {
      tab('General').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(document.activeElement).toBe(tab('Terminal'));
    expect(shown()).toBe('terminal section');
  });

  it('lets a section open another one', () => {
    open('');
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Open Themes"]')?.click());
    expect(shown()).toBe('themes section');
    expect(selected()).toBe('Themes');
  });

  it('follows a section request sent to the open window, unknown ones to general', () => {
    open('?tab=about');
    act(() => tabEvent.handler?.({ payload: 'editor' }));
    expect(shown()).toBe('editor section');
    act(() => tabEvent.handler?.({ payload: 'agents' }));
    expect(shown()).toBe('general section');
  });
});
