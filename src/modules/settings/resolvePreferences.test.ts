import { describe, expect, it, vi } from 'vitest';

// `./store` creates its LazyStore at module load; the plugins must be mocked first.
vi.mock('@tauri-apps/plugin-store', () => ({ LazyStore: class {}, Store: class {} }));
vi.mock('@tauri-apps/api/event', () => ({
  emit: async () => undefined,
  listen: async () => () => undefined,
}));

const { DEFAULT_PREFERENCES } = await import('./store');
const { resolvePreferences } = await import('./resolvePreferences');

const global = {
  ...DEFAULT_PREFERENCES,
  terminalFontSize: 14,
  terminalCursorStyle: 'bar' as const,
};

describe('resolvePreferences', () => {
  it('returns the global values when there are no layers', () => {
    expect(resolvePreferences(global)).toEqual(global);
    expect(resolvePreferences(global, undefined, undefined)).toEqual(global);
  });

  it('lets a profile override the global values', () => {
    const resolved = resolvePreferences(global, { terminalFontSize: 16 });
    expect(resolved.terminalFontSize).toBe(16);
    expect(resolved.terminalCursorStyle).toBe('bar');
  });

  it('lets a space override the profile, and the global values the profile leaves', () => {
    const resolved = resolvePreferences(
      global,
      { terminalFontSize: 16, terminalCursorStyle: 'block' },
      { terminalFontSize: 18, terminalScrollback: 5000 },
    );
    expect(resolved.terminalFontSize).toBe(18);
    expect(resolved.terminalCursorStyle).toBe('block');
    expect(resolved.terminalScrollback).toBe(5000);
  });

  it('keeps the earlier value for a key left undefined', () => {
    const resolved = resolvePreferences(
      global,
      { terminalFontSize: 16 },
      { terminalFontSize: undefined },
    );
    expect(resolved.terminalFontSize).toBe(16);
  });

  it('replaces objects whole instead of merging them', () => {
    const resolved = resolvePreferences(
      { ...global, editorFormatterByLang: { rust: 'rustfmt', go: 'gofmt' } },
      { editorFormatterByLang: { rust: 'lsp' } },
    );
    expect(resolved.editorFormatterByLang).toEqual({ rust: 'lsp' });
  });

  it('leaves its inputs untouched and returns a new object', () => {
    const base = { ...global };
    const profile = { terminalFontSize: 16 };
    const resolved = resolvePreferences(base, profile);
    expect(resolved).not.toBe(base);
    expect(base).toEqual(global);
    expect(profile).toEqual({ terminalFontSize: 16 });
  });
});
