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

/**
 * The group's layout with every side panel at its target width in px (0 is closed) and `absorber` taking the
 * difference, or null when every side panel is already there. One layout for all of them: resizing one panel takes
 * the space from the panel next to it, which can move a side panel that was already where it should be.
 */
export function settledLayout(
  targets: Readonly<Record<string, number>>,
  layout: Layout,
  groupWidth: number,
  absorber: string,
): Layout | null {
  if (groupWidth <= 0 || !(absorber in layout)) return null;
  const next = { ...layout };
  let moved = false;
  for (const [id, target] of Object.entries(targets)) {
    if (!(id in layout)) continue;
    const width = Math.round(((layout[id] ?? 0) / 100) * groupWidth);
    // Percentages round to the pixel either way.
    const away = target <= 0 ? width > 0 : Math.abs(width - target) > 1;
    if (!away) continue;
    const size = (Math.max(target, 0) / groupWidth) * 100;
    next[absorber] += layout[id] - size;
    next[id] = size;
    moved = true;
  }
  return moved ? next : null;
}
