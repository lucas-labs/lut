import type { Tab } from '../types';

// Returns the tab at position `idx` within the given space, or undefined when
// idx is out of range or no matching space tab exists.
export function pickTabBySpaceIndex(tabs: Tab[], idx: number, spaceId: string): Tab | undefined {
  const pool = tabs.filter((t) => t.spaceId === spaceId);
  return pool[idx];
}

/**
 * The Ctrl+Tab order for a space: the active tab, then the space's tabs by recency of use, then
 * the ones never activated in strip order.
 */
export function switcherOrder(
  tabs: Tab[],
  mru: readonly number[],
  activeId: number,
  spaceId: string,
): number[] {
  const inSpace = tabs.filter((t) => t.spaceId === spaceId).map((t) => t.id);
  const present = new Set(inSpace);
  const ordered = mru.filter((id) => present.has(id));
  for (const id of inSpace) if (!ordered.includes(id)) ordered.push(id);
  return [activeId, ...ordered.filter((id) => id !== activeId)];
}

/** The closest terminal tab after (`1`) or before (`-1`) a tab in its space's strip, if any. */
export function neighborTerminalTab(tabs: Tab[], tabId: number, delta: 1 | -1): Tab | undefined {
  const tab = tabs.find((t) => t.id === tabId);
  if (!tab) return undefined;
  const strip = tabs.filter((t) => t.spaceId === tab.spaceId);
  for (
    let i = strip.findIndex((t) => t.id === tabId) + delta;
    i >= 0 && i < strip.length;
    i += delta
  ) {
    if (strip[i].kind === 'terminal') return strip[i];
  }
  return undefined;
}

// Gap index is relative to the space's own strip, including the dragged tab.
export function reorderTabsByGap(tabs: Tab[], fromId: number, toGapIndex: number): Tab[] {
  const moved = tabs.find((t) => t.id === fromId);
  if (!moved) return tabs;
  const sameSpace = tabs.filter((t) => t.spaceId === moved.spaceId);
  const spaceFrom = sameSpace.findIndex((t) => t.id === fromId);
  let spaceTarget = toGapIndex > spaceFrom ? toGapIndex - 1 : toGapIndex;
  spaceTarget = Math.max(0, Math.min(spaceTarget, sameSpace.length - 1));
  if (spaceTarget === spaceFrom) return tabs;
  const anchor = sameSpace[spaceTarget];
  const next = tabs.filter((t) => t.id !== fromId);
  const anchorIdx = next.findIndex((t) => t.id === anchor.id);
  const insertIdx = spaceTarget > spaceFrom ? anchorIdx + 1 : anchorIdx;
  next.splice(insertIdx, 0, moved);
  return next;
}
