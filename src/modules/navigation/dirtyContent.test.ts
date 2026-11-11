import { describe, expect, it } from 'vitest';
import { hasUnsavedChanges, registerDirtyContentProvider } from './dirtyContent';
import type { Tab } from './types';

const editor = (dirty: boolean): Tab => ({
  id: 1,
  kind: 'editor',
  spaceId: 'a',
  title: 'a.ts',
  path: '/a.ts',
  dirty,
  preview: false,
});

describe('dirty content providers', () => {
  it('reports nothing unsaved until a tool registers, and stops when it unregisters', () => {
    expect(hasUnsavedChanges(editor(true))).toBe(false);
    const unregister = registerDirtyContentProvider((tab) => tab.kind === 'editor' && tab.dirty);
    expect(hasUnsavedChanges(editor(true))).toBe(true);
    expect(hasUnsavedChanges(editor(false))).toBe(false);
    unregister();
    expect(hasUnsavedChanges(editor(true))).toBe(false);
  });
});
