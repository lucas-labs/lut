// @vitest-environment happy-dom
import { EDITOR_WORD_WRAP_COLUMN_MAX } from '@/modules/settings/store';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorSection } from './EditorSection';

const defaults = {
  shortcuts: {},
  editorFontSize: 13,
  vimMode: false,
  editorWordWrap: false,
  editorWordWrapColumn: 100,
  editorAutoSave: false,
  editorAutoSaveDelay: 1000,
  editorFormatOnSave: true,
  editorFormatter: 'lsp',
  editorFormatterByLang: {},
  editorCustomFormatCommand: '',
};
const prefs = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@/modules/settings/preferences', () => ({
  usePreferencesStore: (pick: (s: Record<string, unknown>) => unknown) => pick(prefs.state),
}));
const store = vi.hoisted(() => ({
  setEditorWordWrapColumn: vi.fn(async (_column: number) => {}),
  setEditorFormatterByLang: vi.fn(async (_byLang: Record<string, string>) => {}),
}));
vi.mock('@/modules/settings/store', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...store,
}));
vi.mock('../components/LspServersGroup', () => ({ LspServersGroup: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

// The mocked store does not notify its readers, so each state is a fresh mount.
const render = (state: Partial<typeof defaults> = {}) => {
  prefs.state = { ...defaults, ...state };
  act(() => root.unmount());
  root = createRoot(host);
  act(() => root.render(createElement(EditorSection)));
};

beforeEach(() => {
  store.setEditorWordWrapColumn.mockClear();
  store.setEditorFormatterByLang.mockClear();
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
const isHidden = (title: string) => rowOf(title)?.closest('[data-slot="setting-expander-body"]')?.hasAttribute('inert');
const button = (name: string) =>
  [...host.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name);

describe('EditorSection', () => {
  it('groups the settings under the design headings', () => {
    render();
    const groups = [...host.querySelectorAll('section h2')].map((h) => h.textContent);
    expect(groups).toEqual(['Appearance', 'Editing', 'Saving']);
  });

  it('opens the settings that depend on a switch only while it is on', () => {
    render();
    expect(isHidden('Wrap column')).toBe(true);
    expect(isHidden('Auto save delay')).toBe(true);
    expect(isHidden('Formatter')).toBe(false);
    render({ editorWordWrap: true, editorAutoSave: true, editorFormatOnSave: false });
    expect(isHidden('Wrap column')).toBe(false);
    expect(isHidden('Auto save delay')).toBe(false);
    expect(isHidden('Formatter')).toBe(true);
  });

  it('clamps a typed wrap column and saves it when the field is left', () => {
    render({ editorWordWrap: true });
    const input = rowOf('Wrap column')?.querySelector('input') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '9999');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(store.setEditorWordWrapColumn).toHaveBeenCalledWith(EDITOR_WORD_WRAP_COLUMN_MAX);
    expect(input.value).toBe(String(EDITOR_WORD_WRAP_COLUMN_MAX));
  });

  it('puts the saved wrap column back when the field is left empty', () => {
    render({ editorWordWrap: true });
    const input = rowOf('Wrap column')?.querySelector('input') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    expect(store.setEditorWordWrapColumn).not.toHaveBeenCalled();
    expect(input.value).toBe('100');
  });

  it('adds and removes a language override', () => {
    render();
    act(() => button('Add override')?.click());
    expect(store.setEditorFormatterByLang).toHaveBeenCalledTimes(1);
    expect(Object.values(store.setEditorFormatterByLang.mock.calls[0]?.[0] ?? {})).toEqual(['lsp']);

    render({ editorFormatterByLang: { py: 'ruff' } });
    const row = rowOf('Language overrides');
    expect(row?.querySelector('[aria-label="Formatter for Python"]')).not.toBeNull();
    act(() => button('Remove Python override')?.click());
    expect(store.setEditorFormatterByLang).toHaveBeenLastCalledWith({});
  });

  it('asks for the custom command only when a formatter is custom', () => {
    render();
    expect(rowOf('Custom command')).toBeUndefined();
    render({ editorFormatterByLang: { sh: 'custom' } });
    expect(rowOf('Custom command')).toBeDefined();
  });

  it('names every button and field', () => {
    render({ editorWordWrap: true, editorAutoSave: true, editorFormatterByLang: { py: 'custom' } });
    const unnamed = [...host.querySelectorAll('button, input')].filter(
      (c) =>
        !c.getAttribute('aria-label') &&
        !document.getElementById(c.getAttribute('aria-labelledby') ?? '')?.textContent &&
        !c.textContent?.trim(),
    );
    expect(unnamed.map((c) => c.outerHTML)).toEqual([]);
  });
});
