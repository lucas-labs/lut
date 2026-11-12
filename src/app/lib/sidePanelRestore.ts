import type { Layout } from 'react-resizable-panels';

const isOpen = (layout: Layout, id: string) => (layout[id] ?? 0) > 0;

/** A layout the panel group made on its own: the side panels it moved on purpose, and those it moved as a side effect. */
export type SideLayoutChange = { changed: string[]; restore: string[] };

/**
 * How a layout the group made affects the side panels.
 *
 * The group remembers one layout per set of panels and restores it when the set changes (the tab column comes or
 * goes with the orientation, focus mode removes both side panels), and it gives the space a panel frees or takes to
 * its neighbour. Neither is what the user set: a side panel keeps its own state and width, and the workspace takes
 * the difference. A drag is the user's own layout, so it is never undone.
 */
export function sideLayoutChange(
  prev: Layout | null,
  next: Layout,
  isUserInteraction: boolean,
  sidePanels: readonly string[],
): SideLayoutChange {
  const none = { changed: [], restore: [] };
  if (isUserInteraction || prev === null) return none;
  const present = sidePanels.filter((id) => id in next);
  const prevIds = Object.keys(prev).sort().join();
  const nextIds = Object.keys(next).sort().join();
  if (prevIds !== nextIds) return { changed: [], restore: present };
  const toggled = present.filter((id) => id in prev && isOpen(prev, id) !== isOpen(next, id));
  if (toggled.length === 0) return none;
  // A panel that opens can squeeze its neighbour shut in the same layout; the one that opened is the change asked
  // for, and the one that closed goes back. A panel that closes never closes another.
  const opened = toggled.filter((id) => isOpen(next, id));
  const changed = opened.length > 0 ? opened : toggled;
  return { changed, restore: present.filter((id) => !changed.includes(id)) };
}

/**
 * Adds one layout change to the widths in px the side panels should end at, for changes that come together (one
 * command can open or close both). A panel moved on purpose ends where it went, even if an earlier change in the
 * same batch would have put it back; a panel moved as a side effect goes back to its own width, unless the batch
 * moved it on purpose.
 */
export function foldSideLayoutChange(
  targets: Readonly<Record<string, number>>,
  change: SideLayoutChange,
  widthNow: (id: string) => number,
  ownWidth: (id: string) => number,
): Record<string, number> {
  const next = { ...targets };
  for (const id of change.changed) next[id] = widthNow(id);
  for (const id of change.restore) if (!(id in next)) next[id] = ownWidth(id);
  return next;
}

/** The side panels not yet at their target width (0 is collapsed), with the width to set. */
export function sidePanelsToSettle(
  targets: Readonly<Record<string, number>>,
  layout: Layout,
  widthNow: (id: string) => number,
): [id: string, width: number][] {
  return Object.entries(targets).filter(([id, target]) => {
    if (!(id in layout)) return false;
    const width = widthNow(id);
    if (target <= 0) return width > 0;
    // Percentages round to the pixel either way.
    return Math.abs(width - target) > 1;
  });
}
