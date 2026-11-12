import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { IS_MAC } from '@/lib/platform';
import { cn } from '@/lib/utils';
import type { TitleBarPlacement } from '@/modules/header';
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@/modules/sidebar';
import { TABS_COLUMN_MAX_WIDTH, TABS_COLUMN_MIN_WIDTH } from '@/modules/tabs';
import type { ReactNode, RefObject } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';

/**
 * A side panel's resize handle is the 1px line between it and what follows. Its negative margin lets it overlap the
 * next panel instead of taking room, so a closed panel leaves no strip behind; a closed panel's handle is transparent.
 * The handle never measures 0px: the panel library loops on a zero-width separator.
 */
function handleClass(open: boolean) {
  return cn('-mr-px transition-colors duration-[var(--dur-fast)]', open ? 'bg-border' : 'bg-transparent');
}

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
  tabsColumnInitialWidth: number;
  onTabsColumnLayout: (width: number, isUserInteraction: boolean) => void;
  /** Whether the sidebar is open (its handle then draws the line beside it). */
  sidebarOpen: boolean;
  /** Whether the vertical tab column is open. */
  tabsColumnOpen: boolean;
  /** Explorer / Source Control panel content. */
  sidebar: ReactNode;
  sidebarRef: RefObject<PanelImperativeHandle | null>;
  /** The sidebar's width in px when it mounts (on start and after focus mode); 0 is collapsed. */
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
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-frame text-foreground">
      <main className="zoom-content flex min-h-0 flex-1 flex-col">
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
          onLayoutChanged={(_, { isUserInteraction }) => {
            // The side panels are gone in focus mode; their stored layout stays as it was.
            if (focusMode) return;
            onSidebarLayout(sidebarRef.current?.getSize().inPixels ?? 0, isUserInteraction);
            if (tabsColumn) onTabsColumnLayout(tabsColumnRef.current?.getSize().inPixels ?? 0, isUserInteraction);
          }}
        >
          {/* In focus mode the sidebar leaves its slot empty, as the tab column does; it comes back at its width. */}
          {focusMode ? null : (
            <ResizablePanel
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
            </ResizablePanel>
          )}
          {focusMode ? null : <ResizableHandle className={handleClass(sidebarOpen)} />}
          {/* The column and its handle keep their slots when absent, so the workspace never moves in the tree. */}
          {tabsColumn ? (
            <ResizablePanel
              id="tabs-column"
              panelRef={tabsColumnRef}
              defaultSize={`${tabsColumnInitialWidth}px`}
              minSize={`${TABS_COLUMN_MIN_WIDTH}px`}
              maxSize={`${TABS_COLUMN_MAX_WIDTH}px`}
              collapsible
              collapsedSize={0}
            >
              {tabsColumn}
            </ResizablePanel>
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
