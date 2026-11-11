import { leafIds } from '@/modules/terminal/lib/panes';
import { basename } from '../tabTitles';
import type { Tab, TerminalTab } from '../types';

export function coldTerminalTab(
  tabId: number,
  leafId: number,
  spaceId: string,
  cwd?: string,
): TerminalTab {
  return {
    id: tabId,
    kind: 'terminal',
    spaceId,
    cold: true,
    title: cwd ? basename(cwd) : 'shell',
    cwd,
    paneTree: { kind: 'leaf', id: leafId, cwd },
    activeLeafId: leafId,
  };
}

// Plans the removal of a deleted space's tabs while keeping the invariant that
// the now-active `fallbackSpaceId` always has at least one tab (a cold one is
// spawned when it would be left empty). Returns null when nothing to remove.
export function planSpaceRemoval(
  tabs: Tab[],
  currentActiveId: number,
  spaceId: string,
  fallbackSpaceId: string,
  fallbackCwd: string | undefined,
  allocId: () => number,
): { tabs: Tab[]; disposeLeafIds: number[]; activeId: number } | null {
  const removed = tabs.filter((t) => t.spaceId === spaceId);
  if (removed.length === 0) return null;
  const disposeLeafIds = removed
    .filter((t) => t.kind === 'terminal')
    .flatMap((t) => leafIds((t as TerminalTab).paneTree));
  let next = tabs.filter((t) => t.spaceId !== spaceId);
  let activeId = currentActiveId;
  if (!next.some((t) => t.spaceId === fallbackSpaceId)) {
    const tabId = allocId();
    next = [...next, coldTerminalTab(tabId, allocId(), fallbackSpaceId, fallbackCwd)];
    activeId = tabId;
  } else if (!next.some((t) => t.id === currentActiveId)) {
    const inFallback = next.filter((t) => t.spaceId === fallbackSpaceId);
    activeId = inFallback[inFallback.length - 1].id;
  }
  return { tabs: next, disposeLeafIds, activeId };
}
