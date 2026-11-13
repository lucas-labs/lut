import { quoteShellArg } from '@/lib/shellQuote';
import { useLatest } from '@/lib/useLatest';
import { useNavigationStore } from '@/modules/navigation';
import { closeWindow } from '@/modules/platform';
import type { Tab } from '@/modules/tabs';
import {
  hasLeaf,
  leafIds,
  ptyIdForLeaf,
  type TerminalPaneHandle,
  useAgentActivityStore,
  useTerminalFileDrop,
} from '@/modules/terminal';
import type { TerminalSearchController } from '@/modules/terminal/search/TerminalSearchController';
import { workspaceNative } from '@/modules/workspace';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/** The navigation store's current state, for callbacks that must not close over a render's. */
const nav = () => useNavigationStore.getState();

type TerminalPanesArgs = {
  tabs: Tab[];
  activeId: number;
  /** The active terminal tab's focused pane, or null when the active tab is not a terminal. */
  activeLeafId: number | null;
};

/**
 * The terminal panes as the shell sees them (E09-08): their handles and search controllers, what they report (cwd,
 * exit, focus), the file drop onto them, and the shell's actions on them (`cd`, the active pane's search).
 */
export function useTerminalPanes({ tabs, activeId, activeLeafId }: TerminalPanesArgs) {
  const terminalRefs = useRef<Map<number, TerminalPaneHandle>>(new Map());
  const searchAddons = useRef<Map<number, TerminalSearchController>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] = useState<TerminalSearchController | null>(null);
  const pathDropTarget = useTerminalFileDrop();

  useEffect(() => {
    setActiveSearchAddon(
      activeLeafId !== null ? (searchAddons.current.get(activeLeafId) ?? null) : null,
    );
  }, [activeLeafId]);

  // Stable, so the panes don't re-render when the focus moves.
  const activeLeaf = useLatest(activeLeafId);
  const onSearchReady = useCallback(
    (leafId: number, addon: TerminalSearchController) => {
      searchAddons.current.set(leafId, addon);
      if (leafId === activeLeaf.current) setActiveSearchAddon(addon);
    },
    [activeLeaf],
  );

  // Handles and search controllers are keyed by leaf, so they are pruned as the pane trees change.
  useEffect(() => {
    const live = new Set<number>();
    for (const t of tabs) {
      if (t.kind === 'terminal') {
        for (const id of leafIds(t.paneTree)) live.add(id);
      }
    }
    for (const k of [...terminalRefs.current.keys()])
      if (!live.has(k)) terminalRefs.current.delete(k);
    for (const k of [...searchAddons.current.keys()])
      if (!live.has(k)) searchAddons.current.delete(k);
  }, [tabs]);

  // Activating a terminal tab acknowledges its agents' requests for attention.
  useEffect(() => {
    const tab = nav().tabs.find((t) => t.id === activeId);
    if (tab?.kind !== 'terminal') return;
    const ptyIds = leafIds(tab.paneTree).flatMap((leafId) => {
      const ptyId = ptyIdForLeaf(leafId);
      return ptyId === null ? [] : [ptyId];
    });
    useAgentActivityStore.getState().acknowledgeAttention(ptyIds);
  }, [activeId]);

  const registerTerminalHandle = useCallback((leafId: number, h: TerminalPaneHandle | null) => {
    if (h) terminalRefs.current.set(leafId, h);
    else terminalRefs.current.delete(leafId);
  }, []);

  const focusTerminal = useCallback(
    (leafId: number) => terminalRefs.current.get(leafId)?.focus(),
    [],
  );

  const readBuffer = useCallback(
    (leafId: number, maxLines?: number) =>
      terminalRefs.current.get(leafId)?.getBuffer(maxLines) ?? null,
    [],
  );

  /** `cd`s the active terminal to `path` when it sits at its prompt. */
  const sendCd = useCallback(
    (path: string) => {
      if (activeLeafId === null) return;
      const term = terminalRefs.current.get(activeLeafId);
      if (!term) return;
      void term.writeAtPrompt(`cd ${quoteShellArg(path)}\r`).then((typed) => {
        if (typed) {
          term.focus();
          return;
        }
        toast('Terminal is busy', {
          description: 'Open a new tab to go there, or exit the running program.',
        });
      });
    },
    [activeLeafId],
  );

  /** Opens a terminal tab at `path`. */
  const cdInNewTab = useCallback((path: string) => {
    const tabId = nav().newTab(path);
    setTimeout(() => {
      const tab = nav().tabs.find((x) => x.id === tabId);
      if (!tab || tab.kind !== 'terminal') return;
      const t = terminalRefs.current.get(tab.activeLeafId);
      if (!t) return;
      t.write(`cd ${quoteShellArg(path)}\r`);
      t.focus();
    }, 80);
  }, []);

  const authorizedCwds = useRef(new Set<string>());
  const onCwd = useCallback((leafId: number, cwd: string) => {
    nav().setLeafCwd(leafId, cwd);
    if (cwd && !authorizedCwds.current.has(cwd)) {
      authorizedCwds.current.add(cwd);
      workspaceNative.workspaceAuthorize(cwd).catch(() => {
        authorizedCwds.current.delete(cwd);
      });
    }
  }, []);

  const onExit = useCallback((leafId: number, _code: number) => {
    const all = nav().tabs;
    const tab = all.find((t) => t.kind === 'terminal' && hasLeaf(t.paneTree, leafId));
    if (!tab || tab.kind !== 'terminal') return;
    // Last pane of the last tab: quit instead of respawning a shell.
    if (leafIds(tab.paneTree).length === 1 && all.length === 1) {
      void closeWindow();
    } else {
      nav().closePaneByLeaf(leafId);
    }
  }, []);

  const onFocusLeaf = useCallback(
    (tabId: number, leafId: number) => nav().focusPane(tabId, leafId),
    [],
  );

  return {
    activeSearchAddon,
    pathDropTarget,
    registerTerminalHandle,
    onSearchReady,
    onCwd,
    onExit,
    onFocusLeaf,
    focusTerminal,
    readBuffer,
    sendCd,
    cdInNewTab,
  };
}
