import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { IS_MAC } from '@/lib/platform';
import { cn } from '@/lib/utils';
import type { TitleBarPlacement } from '@/modules/header';
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@/modules/sidebar';
import { TABS_COLUMN_MAX_WIDTH, TABS_COLUMN_MIN_WIDTH } from '@/modules/tabs';
import { type ComponentProps, type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react';
import type { Layout, PanelImperativeHandle } from 'react-resizable-panels';
import { sidePanelsToRestore } from './lib/sidePanelRestore';

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
type SidePanelId = (typeof SIDE_PANELS)[number];

type Props = {
  /** Focus mode (E12-10): only the workspace shows; the chrome keeps its own state for when it comes back. */
  focusMode: boolean;
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
  /** Whether the sidebar is open (its handle then draws the line beside it). */
  sidebarOpen: boolean;
  /** Whether the vertical tab column is open. */
  tabsColumnOpen: boolean;
  /** Explorer / Source Control panel content. */
  sidebar: ReactNode;
  sidebarRef: RefObject<PanelImperativeHandle | null>;
  /** The sidebar's width in px as the app keeps it; 0 is collapsed. */
  sidebarInitialWidth: number;
  onSidebarLayout: (width: number, isUserInteraction: boolean) => void;
  onSidebarCollapsedChange: (collapsed: boolean) => void;
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
  titleBar: titleBarProp,
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
  onSidebarLayout,
  onSidebarCollapsedChange,
  workspace,
  children,
}: Props) {
  const titleBar = focusMode ? null : titleBarProp;
  const tabsColumn = focusMode ? null : tabsColumnProp;

  // The side panels' own sizes, and the group's last layout: when the group lays itself out (a panel set change,
  // a panel opening or closing), the side panels that should not have moved go back to their size.
  const sizes = useRef<Record<SidePanelId, number>>({ sidebar: 0, 'tabs-column': 0 });
  useLayoutEffect(() => {
    sizes.current = { sidebar: sidebarInitialWidth, 'tabs-column': tabsColumnInitialWidth };
  });
  const lastLayout = useRef<Layout | null>(null);
  const restoring = useRef(false);
  const group = useRef<HTMLDivElement | null>(null);
  const restoreSidePanels = (ids: string[], target: Record<SidePanelId, number>) => {
    restoring.current = true;
    try {
      for (const id of ids as SidePanelId[]) {
        const panel = (id === 'sidebar' ? sidebarRef : tabsColumnRef).current;
        if (target[id] > 0) panel?.resize(`${target[id]}px`);
        else panel?.collapse();
      }
    } finally {
      restoring.current = false;
    }
  };
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-frame text-foreground">
      <main className="zoom-content flex min-h-0 flex-1 flex-col">
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
          elementRef={group}
          onLayoutChanged={(layout, { isUserInteraction }) => {
            // A layout the restore itself causes is the intended one; it starts nothing new.
            const restore = restoring.current
              ? []
              : sidePanelsToRestore(lastLayout.current, layout, isUserInteraction, SIDE_PANELS);
            lastLayout.current = layout;
            if (restore.length > 0) {
              // The sizes as they were before this layout.
              const target = { ...sizes.current };
              // After the group's own layout pass, not inside it.
              queueMicrotask(() => restoreSidePanels(restore, target));
              // This layout is about to be corrected: the app records the corrected one, not this.
              return;
            }
            // The side panels are gone in focus mode; their stored layout stays as it was.
            if (focusMode) return;
            // From the layout, not the panels' elements: a layout set from code is reported before it renders.
            const width = (id: SidePanelId) =>
              Math.round(((layout[id] ?? 0) / 100) * (group.current?.offsetWidth ?? 0));
            onSidebarLayout(width('sidebar'), isUserInteraction);
            if (tabsColumn) onTabsColumnLayout(width('tabs-column'), isUserInteraction);
          }}
        >
          {/* In focus mode the sidebar leaves its slot empty, as the tab column does; it comes back at its width. */}
          {focusMode ? null : (
            <SidePanel
              id="sidebar"
              panelRef={sidebarRef}
              defaultSize={`${sidebarInitialWidth}px`}
              minSize={`${SIDEBAR_MIN_WIDTH}px`}
              maxSize={`${SIDEBAR_MAX_WIDTH}px`}
              collapsible
              collapsedSize={0}
              onResize={(size) => onSidebarCollapsedChange(size.inPixels <= 0)}
            >
              <div className="flex h-full min-h-0 flex-col">
                {/* macOS draws its traffic lights over the window's top-left corner, which is the sidebar's. */}
                {IS_MAC ? <div data-tauri-drag-region className="h-7 shrink-0" /> : null}
                <div className="min-h-0 flex-1">{sidebar}</div>
              </div>
            </SidePanel>
          )}
          {focusMode ? null : <ResizableHandle className={handleClass(sidebarOpen)} />}
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
      </main>

      {titleBarPlacement === 'overlay' ? titleBar : null}
      {children}
    </div>
  );
}
