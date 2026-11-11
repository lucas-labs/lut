import type { Tab } from '../types';

// Returns the tab at position `idx` within the given space, or undefined when
// idx is out of range or no matching space tab exists.
export function pickTabBySpaceIndex(tabs: Tab[], idx: number, spaceId: string): Tab | undefined {
  const pool = tabs.filter((t) => t.spaceId === spaceId);
  return pool[idx];
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
