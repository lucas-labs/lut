import { leafIds } from '@/modules/terminal/lib/panes';
import type { CloseTabsPlan, Tab } from '../types';

type CloseTabsPlanResult = {
  tabs: Tab[];
  closeIds: number[];
  disposeLeafIds: number[];
  nextActiveId: number;
};

// Next active after close, scoped to the closing tab's space. null = last tab of
// its space, which callers treat as "refuse to close".
export function nextActiveInSpace(tabs: Tab[], closingId: number): number | null {
  const closing = tabs.find((t) => t.id === closingId);
  if (!closing) return null;
  const sameSpace = tabs.filter((t) => t.spaceId === closing.spaceId);
  if (sameSpace.length <= 1) return null;
  const idx = sameSpace.findIndex((t) => t.id === closingId);
  return (sameSpace[idx - 1] ?? sameSpace[idx + 1]).id;
}

/**
 * Plans a Chrome-style "close tabs to the right" within the anchor's space.
 * Returns the ids strictly to the right of the anchor plus the id to keep
 * active: the anchor when the active tab is being closed, unchanged otherwise.
 */
export function planCloseTabsToRight(
  tabs: Tab[],
  anchorId: number,
  activeId: number,
): CloseTabsPlan {
  const anchor = tabs.find((t) => t.id === anchorId);
  if (!anchor) return { closeIds: [], nextActiveId: activeId };
  const sameSpace = tabs.filter((t) => t.spaceId === anchor.spaceId);
  const idx = sameSpace.findIndex((t) => t.id === anchorId);
  const closeIds = sameSpace.slice(idx + 1).map((t) => t.id);
  if (closeIds.length === 0) return { closeIds, nextActiveId: activeId };
  return {
    closeIds,
    nextActiveId: closeIds.includes(activeId) ? anchorId : activeId,
  };
}

/**
 * Plans a Chrome-style "close other tabs" within the anchor's space.
 * Returns every other tab's id in the anchor's space plus the id to keep
 * active: the anchor when the active tab is being closed, unchanged otherwise.
 */
export function planCloseOtherTabs(tabs: Tab[], anchorId: number, activeId: number): CloseTabsPlan {
  const anchor = tabs.find((t) => t.id === anchorId);
  if (!anchor) return { closeIds: [], nextActiveId: activeId };
  const sameSpace = tabs.filter((t) => t.spaceId === anchor.spaceId);
  const closeIds = sameSpace.filter((t) => t.id !== anchorId).map((t) => t.id);
  if (closeIds.length === 0) return { closeIds, nextActiveId: activeId };
  return {
    closeIds,
    nextActiveId: closeIds.includes(activeId) ? anchorId : activeId,
  };
}

export function planSingleTabClose(
  tabs: Tab[],
  closingId: number,
  activeId: number,
): CloseTabsPlanResult | null {
  const fallback = nextActiveInSpace(tabs, closingId);
  if (fallback === null) return null;
  return applyCloseTabsPlan(tabs, fallback, {
    closeIds: [closingId],
    nextActiveId: activeId === closingId ? fallback : activeId,
  });
}

export function applyCloseTabsPlan(
  tabs: Tab[],
  anchorId: number,
  plan: CloseTabsPlan,
): CloseTabsPlanResult | null {
  const anchor = tabs.find((tab) => tab.id === anchorId);
  if (!anchor) return null;

  const requested = new Set(plan.closeIds);
  const closing = tabs.filter(
    (tab) => tab.id !== anchorId && tab.spaceId === anchor.spaceId && requested.has(tab.id),
  );
  if (closing.length === 0) return null;

  const closeIds = closing.map((tab) => tab.id);
  const close = new Set(closeIds);
  const next = tabs.filter((tab) => !close.has(tab.id));
  const nextActiveId = next.some((tab) => tab.id === plan.nextActiveId)
    ? plan.nextActiveId
    : anchorId;
  const disposeLeafIds = closing
    .filter((tab) => tab.kind === 'terminal')
    .flatMap((tab) => leafIds(tab.paneTree));

  return { tabs: next, closeIds, disposeLeafIds, nextActiveId };
}
