import { type CloseTabsPlan, useNavigationStore } from '@/modules/navigation';
import type { Tab } from '@/modules/tabs';
import { useCallback } from 'react';
import { spacesEmptiedByTabs } from './tabCloseGuards';
import { useTabCloseGuards } from './useTabCloseGuards';

/** The navigation store's current state, for callbacks that must not close over a render's. */
const nav = () => useNavigationStore.getState();

type TabClosingArgs = {
  tabs: Tab[];
  activeId: number;
  forgetEditor: (id: number) => void;
  forgetPreview: (id: number) => void;
  /** Opens a tab in a space, at its root, without leaving the active one. */
  newTabInSpace: (spaceId: string) => void;
};

/**
 * Closing tabs (E09-08): the close guards, which ask before losing unsaved changes or a running program, and the
 * disposal of what a closed tab leaves behind. A space emptied by deleted files gets a fresh tab.
 */
export function useTabClosing({
  tabs,
  activeId,
  forgetEditor,
  forgetPreview,
  newTabInSpace,
}: TabClosingArgs) {
  const disposeTab = useCallback(
    (id: number) => {
      // Terminal-leaf-keyed maps (terminal handles, search controllers) are pruned by
      // useTerminalPanes as the pane trees change; only the tab-id-keyed
      // handles need explicit cleanup here.
      forgetEditor(id);
      forgetPreview(id);
      nav().closeTab(id);
    },
    [forgetEditor, forgetPreview],
  );

  const disposeTabs = useCallback(
    (anchorId: number, plan: CloseTabsPlan) => {
      const closedIds = nav().closeTabs(anchorId, plan);
      for (const id of closedIds) {
        forgetEditor(id);
        forgetPreview(id);
      }
    },
    [forgetEditor, forgetPreview],
  );

  const disposeDeletedTabs = useCallback(
    (ids: number[]) => {
      if (ids.length === 0) return;
      for (const spaceId of spacesEmptiedByTabs(nav().tabs, ids)) newTabInSpace(spaceId);
      for (const id of ids) disposeTab(id);
    },
    [disposeTab, newTabInSpace],
  );

  const guards = useTabCloseGuards({
    tabs,
    activeId,
    disposeTab,
    disposeDeletedTabs,
    disposeTabs,
  });

  return { ...guards, disposeTab };
}
