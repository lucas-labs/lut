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
vi.mock('./sections/GeneralSection', () => ({ GeneralSection: () => createElement('p', null, 'general section') }));
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

const shown = () => host.querySelector('main p')?.textContent;
const current = () => host.querySelector('nav [aria-current="page"]')?.textContent;
function navButton(label: string): HTMLButtonElement {
  const button = [...host.querySelectorAll<HTMLButtonElement>('nav button')].find((b) => b.textContent === label);
  if (!button) throw new Error(`no ${label} in the navigation`);
  return button;
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
  it('lists every section in the side navigation', () => {
    open('');
    expect([...host.querySelectorAll('nav button')].map((b) => b.textContent)).toEqual([
      'General',
      'Editor',
      'Themes',
      'Shortcuts',
      'About',
    ]);
  });

  it('opens the section a deep link names', () => {
    open('?tab=shortcuts');
    expect(shown()).toBe('shortcuts section');
    expect(current()).toBe('Shortcuts');
  });

  it('falls back to general for an unknown section', () => {
    open('?tab=models');
    expect(shown()).toBe('general section');
    expect(current()).toBe('General');
  });

  it('switches section from the navigation', () => {
    open('');
    act(() => navButton('Themes').click());
    expect(shown()).toBe('themes section');
    expect(current()).toBe('Themes');
  });

  it('follows a section request sent to the open window, unknown ones to general', () => {
    open('?tab=about');
    act(() => tabEvent.handler?.({ payload: 'editor' }));
    expect(shown()).toBe('editor section');
    act(() => tabEvent.handler?.({ payload: 'agents' }));
    expect(shown()).toBe('general section');
  });
});
