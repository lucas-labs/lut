import type { TitleBarCorner, TitleBarPlacement } from '@/modules/header';

type Chrome = {
  mac: boolean;
  verticalTabs: boolean;
  focusMode: boolean;
  /** The compact sidebar (E27-01). */
  compact: boolean;
  /** The sidebar, or in compact mode the rail, is hidden. */
  sidebarHidden: boolean;
  /** The sidebar's views are closed: in compact mode, those beside the rail. */
  viewsClosed: boolean;
  /** The sidebar or the vertical tab column is open (full mode). */
  sidePanelsOpen: boolean;
};

/**
 * How the title bar sits. Vertical tabs and focus mode float it over the window, shown from the top edge (E11-02,
 * E12-10). On macOS the compact sidebar keeps it in place with vertical tabs too (E27-06): the traffic lights stay
 * shown, and the bar gives them their row beside the rail. `corner` is what lies left of an inline bar.
 */
export function titleBarLayout(c: Chrome): {
  placement: TitleBarPlacement;
  tabStrip: boolean;
  corner: TitleBarCorner;
} {
  const floats = c.focusMode || (c.verticalTabs && !(c.mac && c.compact));
  let corner: TitleBarCorner;
  if (c.compact) corner = !c.viewsClosed ? 'panel' : c.sidebarHidden ? 'window' : 'rail';
  else corner = c.sidePanelsOpen ? 'panel' : 'window';
  return { placement: floats ? 'overlay' : 'inline', tabStrip: !c.verticalTabs, corner };
}
