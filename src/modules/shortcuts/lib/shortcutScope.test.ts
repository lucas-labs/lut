import { shouldDisablePaneLayoutShortcut } from '@/modules/shortcuts/lib/shortcutScope';
import { describe, expect, it } from 'vitest';

describe('shouldDisablePaneLayoutShortcut', () => {
  it.each([
    'pane.swapLeft',
    'pane.swapRight',
    'pane.swapUp',
    'pane.swapDown',
    'pane.focusLeft',
    'pane.focusRight',
    'pane.focusUp',
    'pane.focusDown',
    'pane.resizeLeft',
    'pane.resizeRight',
    'pane.resizeUp',
    'pane.resizeDown',
  ] as const)('disables %s outside multi-pane terminals', (id) => {
    expect(shouldDisablePaneLayoutShortcut(id, null)).toBe(true);
    expect(shouldDisablePaneLayoutShortcut(id, 1)).toBe(true);
    expect(shouldDisablePaneLayoutShortcut(id, 2)).toBe(false);
  });

  it('rejects unrelated shortcuts', () => {
    expect(shouldDisablePaneLayoutShortcut('pane.focusNext', null)).toBe(false);
    expect(shouldDisablePaneLayoutShortcut('editor.undo', 1)).toBe(false);
  });
});
