import { type Tab, useNavigationStore } from '@/modules/navigation';
import { leafIds } from '@/modules/terminal/lib/panes';
import { disposeSession } from '@/modules/terminal/lib/terminalSessionApi';

/** Every leaf some terminal tab still holds, cold tabs included. */
function liveLeaves(tabs: Tab[]): Set<number> {
  const live = new Set<number>();
  for (const tab of tabs) {
    if (tab.kind === 'terminal') for (const id of leafIds(tab.paneTree)) live.add(id);
  }
  return live;
}

/**
 * Ties terminal sessions to navigation: a leaf that leaves every terminal tab has its session
 * (and PTY) disposed, once, right after the update that removed it. Navigation only edits pane
 * trees; a pane moved between tabs in a single update never looks gone. Returns the stop.
 */
export function startSessionReconciler(): () => void {
  let live = liveLeaves(useNavigationStore.getState().tabs);
  return useNavigationStore.subscribe((state, prev) => {
    if (state.tabs === prev.tabs) return;
    const next = liveLeaves(state.tabs);
    for (const id of live) if (!next.has(id)) disposeSession(id);
    live = next;
  });
}
