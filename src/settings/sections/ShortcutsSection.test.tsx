// @vitest-environment happy-dom
import { getBindingTokens, SHORTCUTS } from '@/modules/shortcuts/shortcuts';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortcutsSection } from './ShortcutsSection';

const prefs = vi.hoisted(() => ({ shortcuts: {} as Record<string, unknown> }));
vi.mock('@/modules/settings/preferences', () => ({
  usePreferencesStore: (pick: (s: typeof prefs) => unknown) => pick(prefs),
}));
const store = vi.hoisted(() => ({ setShortcuts: vi.fn(async () => {}) }));
vi.mock('@/modules/settings/store', () => store);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

const render = () => act(() => root.render(createElement(ShortcutsSection)));

beforeEach(() => {
  prefs.shortcuts = {};
  store.setShortcuts.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const byLabel = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
const keysOf = (label: string) => {
  const found = byLabel(`Record shortcut for ${label}`);
  if (!found) throw new Error(`no ${label} row`);
  return found;
};
const resetsIn = (el: Element | null | undefined) =>
  [...(el?.querySelectorAll('button') ?? [])].filter((b) => b.textContent === 'Reset to default');
const rowOf = (label: string) => keysOf(label).closest('[data-slot="setting-row"]');
const press = (init: KeyboardEventInit) =>
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', init));
  });

const newTab = SHORTCUTS.find((s) => s.id === 'tab.new');

describe('ShortcutsSection', () => {
  it('lists each group with every shortcut on its default keys', () => {
    render();
    const groups = [...host.querySelectorAll('section h2')].map((h) => h.textContent);
    expect(groups).toContain('Tabs');
    expect(rowOf('New tab')?.getAttribute('data-variant')).toBe('listed');
    expect(keysOf('New tab').querySelectorAll('kbd[data-slot="kbd"]')).toHaveLength(
      getBindingTokens(newTab?.defaultBindings[0]).length,
    );
  });

  it('records the next key press with a modifier as the binding', () => {
    render();
    act(() => keysOf('New tab').click());
    expect(keysOf('New tab').getAttribute('aria-pressed')).toBe('true');
    press({ key: 'y' });
    expect(store.setShortcuts).not.toHaveBeenCalled();
    press({ key: 'y', ctrlKey: true });
    expect(store.setShortcuts).toHaveBeenCalledWith({
      'tab.new': [{ key: 'y', ctrl: true, shift: false, alt: false, meta: false }],
    });
    expect(keysOf('New tab').getAttribute('aria-pressed')).toBe('false');
  });

  it('cancels recording with Esc or a second click', () => {
    render();
    act(() => keysOf('New tab').click());
    press({ key: 'Escape' });
    expect(keysOf('New tab').getAttribute('aria-pressed')).toBe('false');
    act(() => keysOf('New tab').click());
    act(() => keysOf('New tab').click());
    expect(keysOf('New tab').getAttribute('aria-pressed')).toBe('false');
    press({ key: 'y', ctrlKey: true });
    expect(store.setShortcuts).not.toHaveBeenCalled();
  });

  it('turns the ✕ into a cancel while recording, without clearing or offering reset', () => {
    prefs.shortcuts = { 'tab.new': [{ key: 'y', ctrl: true, shift: false, alt: false, meta: false }] };
    render();
    act(() => keysOf('New tab').click());
    const row = rowOf('New tab');
    expect(row?.querySelector('button[aria-label="Clear shortcut"]')).toBeNull();
    expect(resetsIn(row)).toHaveLength(0);
    act(() => row?.querySelector<HTMLButtonElement>('button[aria-label="Cancel recording"]')?.click());
    expect(keysOf('New tab').getAttribute('aria-pressed')).toBe('false');
    expect(store.setShortcuts).not.toHaveBeenCalled();
  });

  it('offers reset and clear on a changed shortcut, and reset drops its override', () => {
    prefs.shortcuts = { 'tab.new': [{ key: 'y', ctrl: true, shift: false, alt: false, meta: false }] };
    render();
    const resets = resetsIn(host);
    expect(resets).toHaveLength(1);
    expect(rowOf('New tab')?.contains(resets[0])).toBe(true);
    // A changed shortcut shows its clear button too, not only on hover.
    const clear = rowOf('New tab')?.querySelector('button[aria-label="Clear shortcut"]');
    expect(clear?.className).not.toContain('opacity-0');
    act(() => resets[0].click());
    expect(store.setShortcuts).toHaveBeenCalledWith({});
  });

  it('clears a shortcut, which then reads Unassigned', () => {
    render();
    const clear = rowOf('New tab')?.querySelector<HTMLButtonElement>('button[aria-label="Clear shortcut"]');
    act(() => clear?.click());
    expect(store.setShortcuts).toHaveBeenCalledWith({ 'tab.new': [] });

    prefs.shortcuts = { 'tab.new': [] };
    render();
    expect(keysOf('New tab').textContent).toBe('Unassigned');
    expect(rowOf('New tab')?.querySelector('button[aria-label="Clear shortcut"]')).toBeNull();
  });

  it('filters by shortcut name and by group', () => {
    render();
    const search = host.querySelector('input') as HTMLInputElement;
    const type = (value: string) =>
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, value);
        search.dispatchEvent(new Event('input', { bubbles: true }));
      });
    type('new tab');
    expect(byLabel('Record shortcut for New tab')).not.toBeNull();
    expect(byLabel('Record shortcut for Zoom in')).toBeNull();
    type('view');
    expect(byLabel('Record shortcut for Zoom in')).not.toBeNull();
    expect(byLabel('Record shortcut for New tab')).toBeNull();
  });

  it('names every button', () => {
    prefs.shortcuts = { 'tab.new': [] };
    render();
    const unnamed = [...host.querySelectorAll('button')].filter(
      (b) => !b.getAttribute('aria-label') && !b.textContent?.trim(),
    );
    expect(unnamed).toHaveLength(0);
  });
});
