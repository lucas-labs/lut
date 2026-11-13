import type { TerminalSearchController } from '@/modules/terminal/search/TerminalSearchController';
import type { PaneNode } from './lib/panes';
import { PaneTreeView } from './PaneTreeView';
import type { TerminalPaneHandle } from './TerminalPane';

/** What TerminalStack needs from a terminal tab: its id, its pane tree and its focused pane. */
export type TerminalStackEntry = { id: number; paneTree: PaneNode; activeLeafId: number };

type Props = {
  /** Mounted terminals; the caller decides which (e.g. cold restored tabs stay out). */
  terminals: TerminalStackEntry[];
  activeId: number;
  /** Register/unregister handle by leaf id (not tab id). */
  registerHandle: (leafId: number, handle: TerminalPaneHandle | null) => void;
  onSearchReady: (leafId: number, addon: TerminalSearchController) => void;
  onCwd: (leafId: number, cwd: string) => void;
  onExit: (leafId: number, code: number) => void;
  onFocusLeaf: (tabId: number, leafId: number) => void;
  /** The user resized a split of a tab: its children's new shares. */
  onSplitRatios?: (tabId: number, splitId: number, ratios: number[]) => void;
};

export function TerminalStack({
  terminals,
  activeId,
  registerHandle,
  onSearchReady,
  onCwd,
  onExit,
  onFocusLeaf,
  onSplitRatios,
}: Props) {
  return (
    <div data-terminal-stack="" className="relative h-full w-full">
      {/*
        The one canvas every WebGPU pane of this window draws into (WebGpuWindowCanvas). It is
        exempt from the app zoom like the panes, so its CSS pixels are real pixels, and it clips
        the canvas to the area. Tabs and panes above it are transparent where it shows through.
      */}
      <div
        data-terminal-area=""
        aria-hidden="true"
        className="zoom-exempt pointer-events-none absolute inset-0 overflow-hidden"
      />
      {terminals.map((t) => {
        const tabVisible = t.id === activeId;
        return (
          <div
            key={t.id}
            data-terminal-tab={t.id}
            className="absolute inset-0"
            style={{
              visibility: tabVisible ? 'visible' : 'hidden',
              pointerEvents: tabVisible ? 'auto' : 'none',
            }}
            aria-hidden={!tabVisible}
          >
            <PaneTreeView
              node={t.paneTree}
              tabVisible={tabVisible}
              activeLeafId={t.activeLeafId}
              onFocusLeaf={(leafId) => onFocusLeaf(t.id, leafId)}
              registerHandle={registerHandle}
              onSearchReady={onSearchReady}
              onCwd={onCwd}
              onExit={onExit}
              onSplitRatios={onSplitRatios && ((splitId, ratios) => onSplitRatios(t.id, splitId, ratios))}
            />
          </div>
        );
      })}
    </div>
  );
}
