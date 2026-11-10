import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@/modules/sidebar';
import type { ReactNode, RefObject } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';

type Props = {
  /** Title bar with the tab strip; null hides it (zen mode). */
  header: ReactNode;
  /** Explorer / Source Control panel content. */
  sidebar: ReactNode;
  sidebarRef: RefObject<PanelImperativeHandle | null>;
  /** Initial sidebar width in px; 0 starts collapsed. */
  sidebarInitialWidth: number;
  onSidebarLayout: (width: number, isUserInteraction: boolean) => void;
  onSidebarCollapsedChange: (collapsed: boolean) => void;
  /** The tab surfaces, with the single TerminalStack. */
  workspace: ReactNode;
  /** Bottom status bar; null hides it (zen mode). */
  statusBar: ReactNode;
  /** Bridges, dialogs and other overlays. */
  children?: ReactNode;
};

/**
 * The window layout: chrome regions around one workspace whose position in the tree never changes, so showing,
 * hiding or rearranging the chrome never remounts the terminals (F1, E07-03). Every region keeps its slot even when
 * empty: a region that comes and goes must not shift the workspace to another place in the tree.
 */
export function AppShell({
  header,
  sidebar,
  sidebarRef,
  sidebarInitialWidth,
  onSidebarLayout,
  onSidebarCollapsedChange,
  workspace,
  statusBar,
  children,
}: Props) {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-frame text-foreground">
      {header}

      <main className="zoom-content flex min-h-0 flex-1 flex-col">
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
          onLayoutChanged={(_, { isUserInteraction }) => {
            onSidebarLayout(sidebarRef.current?.getSize().inPixels ?? 0, isUserInteraction);
          }}
        >
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
            {sidebar}
          </ResizablePanel>
          <ResizableHandle className="w-1 rounded-full bg-transparent transition-colors duration-[var(--dur-fast)] after:w-4 hover:bg-border" />
          <ResizablePanel id="workspace" defaultSize="78%" minSize="30%">
            <div className="h-full min-h-0 pl-0.5 pr-2">
              <div className="lut-pane flex h-full min-h-0 flex-col">
                <div className="relative min-h-0 flex-1">{workspace}</div>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>

      {statusBar}

      {children}
    </div>
  );
}
