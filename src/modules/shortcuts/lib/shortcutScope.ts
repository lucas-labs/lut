import type { ShortcutId } from '@/modules/shortcuts/shortcuts';

const PANE_LAYOUT_SHORTCUTS: ReadonlySet<ShortcutId> = new Set([
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
]);

/** Whether a shortcut swaps, focuses or resizes a pane by direction. */
export function isPaneLayoutShortcut(id: ShortcutId): boolean {
  return PANE_LAYOUT_SHORTCUTS.has(id);
}

/**
 * A pane layout shortcut only acts in a terminal tab with two panes or more; anywhere else its keys (Alt+arrows for
 * focus and resize) reach the terminal or the editor.
 */
export function shouldDisablePaneLayoutShortcut(
  id: ShortcutId,
  terminalPaneCount: number | null,
): boolean {
  return isPaneLayoutShortcut(id) && (terminalPaneCount === null || terminalPaneCount < 2);
}
