import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { cn } from '@/lib/utils';
import type { TitleBarPlacement } from '@/modules/header';
import { IS_MAC } from '@/modules/platform';
import { COMPACT_RAIL_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH, useEdgeDrag } from '@/modules/sidebar';
import { TABS_COLUMN_MAX_WIDTH, TABS_COLUMN_MIN_WIDTH } from '@/modules/tabs';
import { type ComponentProps, type ReactNode, type RefObject, useRef, useState } from 'react';
import type { GroupImperativeHandle, Layout, PanelImperativeHandle } from 'react-resizable-panels';
import { foldSideLayoutChange, restoreWidth, settledLayout, sideLayoutChange } from './lib/sidePanelRestore';

/**
 * A side panel's resize handle is the 1px line between it and what follows. Its negative margin lets it overlap the
 * next panel instead of taking room, so a closed panel leaves no strip behind; a closed panel's handle is transparent.
 * The handle never measures 0px: the panel library loops on a zero-width separator.
 */
function handleClass(open: boolean) {
  return cn('-mr-px transition-colors duration-[var(--dur-fast)]', open ? 'bg-border' : 'bg-transparent');
}

/**
 * A side panel: it keeps its width in pixels when the window resizes, and the workspace takes the difference.
 *
 * Its `defaultSize` is the one it mounted with. The panel library re-registers a panel and lays its group out again
 * whenever `defaultSize` changes, so a size that follows the panel's own state (collapsed or not) feeds back into
 * itself.
 */
function SidePanel({ defaultSize, ...props }: ComponentProps<typeof ResizablePanel>) {
  const [mountedSize] = useState(defaultSize);
  return <ResizablePanel groupResizeBehavior="preserve-pixel-size" defaultSize={mountedSize} {...props} />;
}

const SIDE_PANELS = ['sidebar', 'tabs-column'] as const;

/**
 * Sets a layout the app makes itself, flagged so the group's report of it is not taken for one to correct. Outside the
 * component: the React Compiler does not compile a `try` without a `catch`.
 */
function applyOwnLayout(group: GroupImperativeHandle | null, layout: Layout, restoring: { current: boolean }) {
  restoring.current = true;
  try {
    group?.setLayout(layout);
  } finally {
    restoring.current = false;
  }
}

/**
 * Closes the compact views once the drag that collapsed them ends, if they are still collapsed then: taking a panel
 * out of its group in the middle of a drag would leave the drag on a layout that no longer exists, and the drag may
 * still open them again.
 */
function closeAfterDrag(panel: RefObject<PanelImperativeHandle | null>, close: () => void) {
  const closeIfCollapsed = () => {
    if ((panel.current?.getSize().inPixels ?? 0) <= 0) close();
  };
  if (document.querySelector('[data-separator="active"]')) {
    window.addEventListener('pointerup', closeIfCollapsed, { once: true });
  } else closeIfCollapsed();
}

type Props = {
  /**
   * Focus mode (E12-10): only the workspace shows, and the title bar as an overlay; the side panels keep their own
   * state for when they come back.
   */
  focusMode: boolean;
  /**
   * Compact sidebar (E27-01): `rail`, fixed at 32 px, leads the window and hides and shows like the sidebar; the tab
   * column is out. The sidebar's panel exists only while its views are open beside the rail (E27-04).
   */
  compact: boolean;
  rail: ReactNode;
  /** In compact mode, whether the sidebar's views are open beside the rail. */
  compactPanelOpen: boolean;
  /** In compact mode, the views closing from their edge; in full mode that is `onSidebarHiddenChange`. */
  onCompactPanelChange: (open: boolean) => void;
  titleBar: ReactNode;
  /**
   * `inline`: above the workspace, beside the sidebar (horizontal tabs). `overlay`: over the whole window, laid
   * out by the bar itself (vertical tabs).
   */
  titleBarPlacement: TitleBarPlacement;
  /** Vertical tab column right of the sidebar; null when the tabs are in the title bar (E07-05). */
  tabsColumn: ReactNode;
  tabsColumnRef: RefObject<PanelImperativeHandle | null>;
  /** The tab column's width in px as the app keeps it; 0 is collapsed. */
  tabsColumnInitialWidth: number;
  onTabsColumnLayout: (width: number, isUserInteraction: boolean) => void;
  /** Whether the sidebar, or in compact mode the rail, is open (its handle then draws the line beside it). */
  sidebarOpen: boolean;
  /** Whether the vertical tab column is open. */
  tabsColumnOpen: boolean;
  /** Explorer / Source Control panel content. */
  sidebar: ReactNode;
  sidebarRef: RefObject<PanelImperativeHandle | null>;
  /** The sidebar's width in px as the app keeps it; 0 is hidden. */
  sidebarInitialWidth: number;
  /** The sidebar's stored width in px, hidden or not: the views open at it beside the rail. */
  sidebarWidth: number;
  onSidebarLayout: (width: number, isUserInteraction: boolean) => void;
  /** The sidebar, or in compact mode the rail, hiding or showing. */
  onSidebarHiddenChange: (hidden: boolean) => void;
  /** The tab surfaces, with the single TerminalStack. */
  workspace: ReactNode;
  /** Bridges, dialogs and other overlays. */
  children?: ReactNode;
};

/**
 * The window layout: chrome regions around one workspace whose position in the tree never changes, so showing,
 * hiding or rearranging the chrome never remounts the terminals (F1, E07-03). Every region keeps its slot even when
 * empty: a region that comes and goes must not shift the workspace to another place in the tree.
 */
export function AppShell({
  focusMode,
  compact,
  rail,
  compactPanelOpen,
  onCompactPanelChange,
  titleBar,
  titleBarPlacement,
  tabsColumn: tabsColumnProp,
  tabsColumnRef,
  tabsColumnInitialWidth,
  onTabsColumnLayout,
  sidebar,
  sidebarOpen,
  tabsColumnOpen,
  sidebarRef,
  sidebarInitialWidth,
  sidebarWidth,
  onSidebarLayout,
  onSidebarHiddenChange,
  workspace,
  children,
}: Props) {
  // Focus mode takes the side panels out, compact mode the tab column; their stored layout stays as it was.
  const tabsColumn = focusMode || compact ? null : tabsColumnProp;

  // The side panels' own widths as of the last layout the app accepted, and the group's last layout: when the group
  // lays itself out (a panel set change, a panel opening or closing), the side panels that should not have moved go
  // back to their width.
  const showRail = compact && !focusMode;
  // In compact mode the sidebar's panel is there only while its views are open, and it opens at the stored width.
  const showSidebar = !focusMode && (!compact || compactPanelOpen);
  const sidebarMountWidth = compact ? sidebarWidth : sidebarInitialWidth;
  const viewsOpen = compact ? compactPanelOpen : sidebarOpen;
  // The rail's edge hides it, or with the rail hidden shows it, in one jump once a drag passes the threshold; back over
  // it before the release, the drag undoes that. A rail that ends hidden closes the views beside it (E27-05).
  const railEdge = useEdgeDrag({
    direction: sidebarOpen ? 'left' : 'right',
    onChange: (passed, direction) => onSidebarHiddenChange((direction === 'left') === passed),
    onEnd: (passed, direction) => {
      if ((direction === 'left') === passed) onCompactPanelChange(false);
    },
  });
  const sizes = useRef<Record<string, number>>({
    sidebar: sidebarMountWidth,
    'tabs-column': tabsColumnInitialWidth,
  });
  const lastLayout = useRef<Layout | null>(null);
  // The widths the side panels should end at once the current batch of layout changes settles; null when none is
  // pending.
  const pending = useRef<Record<string, number> | null>(null);
  const restoring = useRef(false);
  const group = useRef<HTMLDivElement | null>(null);
  const groupHandle = useRef<GroupImperativeHandle | null>(null);
  // From the layout, not the panels' elements: a layout set from code is reported before it renders.
  const widthIn = (layout: Layout) => (id: string) =>
    Math.round(((layout[id] ?? 0) / 100) * (group.current?.offsetWidth ?? 0));

  const accept = (layout: Layout, isUserInteraction: boolean) => {
    // The side panels are gone in focus mode; their stored layout stays as it was.
    if (focusMode) return;
    const width = widthIn(layout);
    for (const id of SIDE_PANELS) if (id in layout) sizes.current[id] = width(id);
    if ('sidebar' in layout) onSidebarLayout(width('sidebar'), isUserInteraction);
    if (tabsColumn) onTabsColumnLayout(width('tabs-column'), isUserInteraction);
  };

  // After the group's own layout pass, not inside it; every change one command made has been reported by then.
  const settle = () => {
    const targets = pending.current;
    pending.current = null;
    const layout = lastLayout.current;
    if (!targets || !layout) return;
    const settled = settledLayout(targets, layout, group.current?.offsetWidth ?? 0, 'workspace');
    if (settled) applyOwnLayout(groupHandle.current, settled, restoring);
    // The settled layout, also when it needed no correction and the group reported nothing more.
    if (lastLayout.current) accept(lastLayout.current, false);
  };
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-frame text-foreground">
      <main className="zoom-content relative flex min-h-0 flex-1">
        {/* The rail is no resizable panel: its width never changes, it only hides and shows. It keeps its slot when
            absent, so the panel group never moves in the tree. */}
        {showRail ? (
          <div
            data-chrome-rail
            className={cn('h-full min-h-0 shrink-0', !sidebarOpen && 'hidden')}
            style={{ width: COMPACT_RAIL_WIDTH }}
          >
            {rail}
          </div>
        ) : null}
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
          elementRef={group}
          groupRef={groupHandle}
          onLayoutChanged={(layout, { isUserInteraction }) => {
            const prev = lastLayout.current;
            lastLayout.current = layout;
            // A layout the settling itself causes is the intended one; it starts nothing new.
            if (!restoring.current) {
              const change = sideLayoutChange(prev, layout, isUserInteraction, SIDE_PANELS);
              if (pending.current || change.restore.length > 0) {
                const first = pending.current === null;
                pending.current = foldSideLayoutChange(pending.current ?? {}, change, widthIn(layout), (id) =>
                  restoreWidth(id, sizes.current[id], { viewsOpen, sidebarWidth }),
                );
                if (first) queueMicrotask(settle);
                // This layout is about to be corrected: the app records the settled one, not this.
                return;
              }
            }
            accept(layout, isUserInteraction);
          }}
        >
          {/* In focus mode the side panels leave their slots empty; they come back at their widths. In compact mode the
              sidebar's panel is there only while its views are open beside the rail, and its edge only resizes or
              closes them: closed, they open again from the rail's buttons. */}
          {showSidebar ? (
            <SidePanel
              id="sidebar"
              panelRef={sidebarRef}
              defaultSize={`${sidebarMountWidth}px`}
              minSize={`${SIDEBAR_MIN_WIDTH}px`}
              maxSize={`${SIDEBAR_MAX_WIDTH}px`}
              collapsible
              collapsedSize={0}
              onResize={(size) => {
                if (!compact) onSidebarHiddenChange(size.inPixels <= 0);
                else if (size.inPixels <= 0) closeAfterDrag(sidebarRef, () => onCompactPanelChange(false));
              }}
            >
              <div className="flex h-full min-h-0 flex-col">
                {/* macOS draws its traffic lights over the window's top-left corner: the sidebar's, unless the rail
                    leads. */}
                {IS_MAC && !compact ? <div data-tauri-drag-region className="h-7 shrink-0" /> : null}
                <div className="min-h-0 flex-1">{sidebar}</div>
              </div>
            </SidePanel>
          ) : null}
          {showSidebar ? <ResizableHandle className={handleClass(viewsOpen)} /> : null}
          {/* The column and its handle keep their slots when absent, so the workspace never moves in the tree. */}
          {tabsColumn ? (
            <SidePanel
              id="tabs-column"
              panelRef={tabsColumnRef}
              defaultSize={`${tabsColumnInitialWidth}px`}
              minSize={`${TABS_COLUMN_MIN_WIDTH}px`}
              maxSize={`${TABS_COLUMN_MAX_WIDTH}px`}
              collapsible
              collapsedSize={0}
            >
              {tabsColumn}
            </SidePanel>
          ) : null}
          {tabsColumn ? <ResizableHandle className={handleClass(tabsColumnOpen)} /> : null}
          <ResizablePanel id="workspace" defaultSize="78%" minSize="30%">
            <div className="flex h-full min-h-0 flex-col">
              {/* Both bar slots always exist (null when unused), so the workspace keeps its place in the tree. */}
              {titleBarPlacement === 'inline' ? titleBar : null}
              <div className="lut-pane flex min-h-0 flex-1 flex-col">
                <div className="relative min-h-0 flex-1">{workspace}</div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
        {/* The rail's edge, a line like a side panel's handle; with the rail hidden, an 8 px strip at the window's
            left edge (E27-05). */}
        {showRail ? (
          <div
            aria-hidden
            data-rail-edge
            {...railEdge}
            className={cn(
              'absolute inset-y-0 z-20 w-px cursor-col-resize select-none after:absolute after:inset-y-0 hover:bg-ring/40',
              handleClass(sidebarOpen),
              sidebarOpen ? 'after:left-1/2 after:w-3 after:-translate-x-1/2' : 'after:left-0 after:w-2',
            )}
            style={{ left: sidebarOpen ? COMPACT_RAIL_WIDTH : 0 }}
          />
        ) : null}
      </main>

      {titleBarPlacement === 'overlay' ? titleBar : null}
      {children}
    </div>
  );
}
