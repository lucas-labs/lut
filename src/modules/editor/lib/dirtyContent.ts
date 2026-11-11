import type { Tab } from '@/modules/navigation';

/** An editor tab is dirty while its buffer differs from the file on disk. */
export function editorHasUnsavedChanges(tab: Tab): boolean {
  return tab.kind === 'editor' && tab.dirty;
}
