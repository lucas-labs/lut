import type { Tab } from './types';

/** Answers whether a tab holds unsaved changes; a tool registers one for the tabs it owns. */
export type DirtyContentProvider = (tab: Tab) => boolean;

const providers = new Set<DirtyContentProvider>();

/** Registers a provider while the tool that owns it is loaded. Returns the undo. */
export function registerDirtyContentProvider(provider: DirtyContentProvider): () => void {
  providers.add(provider);
  return () => {
    providers.delete(provider);
  };
}

/** Whether closing this tab would discard unsaved changes. */
export function hasUnsavedChanges(tab: Tab): boolean {
  for (const provider of providers) if (provider(tab)) return true;
  return false;
}
