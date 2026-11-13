import type { EditorPaneHandle } from '@/modules/editor';
import type { GitHistorySearchHandle } from '@/modules/git-history';
import type { SearchTarget } from '@/modules/header';
import type { Tab } from '@/modules/tabs';
import type { TerminalSearchController } from '@/modules/terminal/search/TerminalSearchController';
import { useMemo, useState } from 'react';

type SearchTargetArgs = {
  activeTab: Tab | undefined;
  activeLeafId: number | null;
  activeSearchAddon: TerminalSearchController | null;
  focusTerminal: (leafId: number) => void;
  activeEditorHandle: EditorPaneHandle | null;
};

/**
 * What the header's search box searches (E09-08): the active terminal pane, editor or commit log, once its search is
 * ready.
 */
export function useSearchTarget({
  activeTab,
  activeLeafId,
  activeSearchAddon,
  focusTerminal,
  activeEditorHandle,
}: SearchTargetArgs) {
  const [gitHistoryHandle, setGitHistoryHandle] = useState<GitHistorySearchHandle | null>(null);
  const isTerminalTab = activeTab?.kind === 'terminal';
  const isEditorTab = activeTab?.kind === 'editor';
  const isGitHistoryTab = activeTab?.kind === 'git-history';

  const searchTarget = useMemo<SearchTarget>(() => {
    if (isTerminalTab && activeLeafId !== null && activeSearchAddon)
      return {
        kind: 'terminal',
        addon: activeSearchAddon,
        focus: () => focusTerminal(activeLeafId),
      };
    if (isEditorTab && activeEditorHandle)
      return {
        kind: 'editor',
        handle: activeEditorHandle,
        focus: () => activeEditorHandle.focus(),
      };
    if (isGitHistoryTab && gitHistoryHandle)
      return {
        kind: 'git-history',
        handle: gitHistoryHandle,
        focus: () => {},
      };
    return null;
  }, [
    isTerminalTab,
    isEditorTab,
    isGitHistoryTab,
    activeLeafId,
    activeSearchAddon,
    focusTerminal,
    activeEditorHandle,
    gitHistoryHandle,
  ]);

  return { searchTarget, onGitHistorySearchHandle: setGitHistoryHandle };
}
