import type { Layout } from 'react-resizable-panels';

const isOpen = (layout: Layout, id: string) => (layout[id] ?? 0) > 0;

/**
 * Which side panels to put back at their own size after the panel group laid itself out.
 *
 * The group remembers one layout per set of panels and restores it when the set changes (the tab column comes or
 * goes with the orientation, focus mode removes both side panels), and it gives the space a panel frees or takes to
 * its neighbour. Neither is what the user set: a side panel keeps its own state and width, and the workspace takes
 * the difference. A drag is the user's own layout, so it is never undone.
 */
export function sidePanelsToRestore(
  prev: Layout | null,
  next: Layout,
  isUserInteraction: boolean,
  sidePanels: readonly string[],
): string[] {
  if (isUserInteraction || prev === null) return [];
  const present = sidePanels.filter((id) => id in next);
  const prevIds = Object.keys(prev).sort().join();
  const nextIds = Object.keys(next).sort().join();
  if (prevIds !== nextIds) return present;
  const toggled = present.filter((id) => id in prev && isOpen(prev, id) !== isOpen(next, id));
  if (toggled.length === 0) return [];
  // A panel that opens can squeeze its neighbour shut in the same layout; the one that opened is the change asked
  // for, and the one that closed goes back. A panel that closes never closes another.
  const opened = toggled.filter((id) => isOpen(next, id));
  const changed = opened.length > 0 ? opened : toggled;
  return present.filter((id) => !changed.includes(id));
}
