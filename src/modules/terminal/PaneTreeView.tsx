import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import type { TerminalSearchController } from '@/modules/terminal/search/TerminalSearchController';
import { Fragment, useCallback, useEffect, useRef } from 'react';
import type { GroupImperativeHandle, Layout } from 'react-resizable-panels';
import { useTerminalDropStore } from './lib/dropStore';
import { firstLeafSlotId, type PaneNode } from './lib/panes';
import { beginTerminalResizeInteraction, endTerminalResizeInteraction } from './lib/terminalResizeInteraction';
import { TerminalPane, type TerminalPaneHandle } from './TerminalPane';

type Props = {
  node: PaneNode;
  tabVisible: boolean;
  activeLeafId: number;
  onFocusLeaf: (leafId: number) => void;
  /** Register/unregister a pane's handle by leaf id. */
  registerHandle: (leafId: number, handle: TerminalPaneHandle | null) => void;
  onSearchReady: (leafId: number, addon: TerminalSearchController) => void;
  onCwd: (leafId: number, cwd: string) => void;
  onExit: (leafId: number, code: number) => void;
  /** The user resized a split: its children's new shares, in child order. */
  onSplitRatios?: (splitId: number, ratios: number[]) => void;
  /** The node sits inside a split, so the tab has more than one pane. */
  inSplit?: boolean;
};

type SplitNode = Extract<PaneNode, { kind: 'split' }>;
type LeafNode = Extract<PaneNode, { kind: 'leaf' }>;

const panelId = (child: PaneNode) => `pane-slot-${firstLeafSlotId(child)}`;

export function PaneTreeView(props: Props) {
  const { node } = props;
  if (node.kind === 'leaf') return <PaneLeaf {...props} node={node} />;
  return <SplitView {...props} node={node} />;
}

function PaneLeaf({
  node,
  tabVisible,
  activeLeafId,
  onFocusLeaf,
  registerHandle,
  onSearchReady,
  onCwd,
  onExit,
  inSplit = false,
}: Props & { node: LeafNode }) {
  const leafId = node.id;
  const focused = leafId === activeLeafId;
  // One ref callback per pane for its whole life: a new one would make React detach and attach the handle.
  const setRef = useCallback((h: TerminalPaneHandle | null) => registerHandle(leafId, h), [registerHandle, leafId]);
  return (
    <div
      onMouseDownCapture={() => {
        if (!focused) onFocusLeaf(leafId);
      }}
      // Catches focus from Tab, programmatic focus, or any path that
      // skips mousedown — keeps activeLeafId in sync with DOM focus.
      onFocus={() => {
        if (!focused) onFocusLeaf(leafId);
      }}
      data-pane-leaf={leafId}
      className="relative h-full w-full"
    >
      <TerminalPane
        leafId={leafId}
        visible={tabVisible}
        focused={focused}
        initialCwd={node.cwd}
        ref={setRef}
        onSearchReady={onSearchReady}
        onCwd={onCwd}
        onExit={onExit}
      />
      {focused && inSplit ? <ActivePaneMark /> : null}
      <DropOverlay leafId={leafId} />
    </div>
  );
}

/**
 * Marks the active pane of a split: a small triangle in its top-right corner, in lut's accent. A border around the
 * pane would frame the text; the corner mark says which pane takes the keys without covering any of it.
 */
function ActivePaneMark() {
  return (
    <span
      aria-hidden
      data-active-pane-mark=""
      className="pointer-events-none absolute top-0 right-0 z-10 size-0 border-t-[10px] border-l-[10px] border-t-primary border-l-transparent"
    />
  );
}

/**
 * A split laid out by the model's ratios. A user resize is written back to the model; a model
 * change (a pane added or closed, a restore) is applied to the live layout, so the panes keep
 * their proportions across tab switches and tree edits.
 */
function SplitView(props: Props & { node: SplitNode }) {
  const { node, onSplitRatios } = props;
  const groupRef = useRef<GroupImperativeHandle | null>(null);
  const ids = node.children.map(panelId);
  const idsKey = ids.join(',');

  useEffect(() => {
    const ids = idsKey.split(',');
    const wanted: Layout = Object.fromEntries(ids.map((id, i) => [id, node.ratios[i] * 100]));
    // A closed pane's panel unregisters after this effect may run; apply the layout once the
    // group holds exactly this split's panels, a few frames at most.
    let frame = 0;
    let tries = 0;
    const apply = () => {
      const group = groupRef.current;
      if (!group) return;
      const live = group.getLayout();
      const liveIds = Object.keys(live);
      if (liveIds.length !== ids.length || ids.some((id) => !(id in live))) {
        if (++tries <= 3) frame = requestAnimationFrame(apply);
        return;
      }
      if (ids.some((id) => Math.abs(live[id] - wanted[id]) > 0.5)) group.setLayout(wanted);
    };
    apply();
    return () => cancelAnimationFrame(frame);
  }, [idsKey, node.ratios]);

  return (
    <ResizablePanelGroup
      groupRef={groupRef}
      orientation={node.dir === 'row' ? 'horizontal' : 'vertical'}
      onLayoutChanged={(layout, { isUserInteraction }) => {
        // Only a drag or a key moves the model: a programmatic layout (mount, setLayout) would
        // echo the model back to itself.
        if (!isUserInteraction) return;
        onSplitRatios?.(
          node.id,
          ids.map((id) => layout[id] ?? 0),
        );
      }}
    >
      {node.children.map((child, i) => (
        <Fragment key={ids[i]}>
          {i > 0 && <TerminalResizableHandle />}
          <ResizablePanel id={ids[i]} defaultSize={`${node.ratios[i] * 100}%`} minSize="10%">
            <PaneTreeView {...props} node={child} inSplit />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}

const RESIZE_KEYS = new Set(['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home']);

function TerminalResizableHandle() {
  const interactionToken = useRef<object>({});
  const removePointerListeners = useRef<(() => void) | null>(null);

  const finish = useCallback(() => {
    removePointerListeners.current?.();
    removePointerListeners.current = null;
    endTerminalResizeInteraction(interactionToken.current);
  }, []);

  const startPointerInteraction = useCallback(() => {
    finish();
    beginTerminalResizeInteraction(interactionToken.current);
    const handlePointerEnd = () => finish();
    window.addEventListener('pointerup', handlePointerEnd, true);
    window.addEventListener('pointercancel', handlePointerEnd, true);
    removePointerListeners.current = () => {
      window.removeEventListener('pointerup', handlePointerEnd, true);
      window.removeEventListener('pointercancel', handlePointerEnd, true);
    };
  }, [finish]);

  useEffect(() => finish, [finish]);

  return (
    <ResizableHandle
      className="bg-border/50 transition-colors duration-[var(--dur-fast)] after:w-3 hover:bg-border"
      onPointerDownCapture={(event) => {
        if (event.button === 0) startPointerInteraction();
      }}
      onKeyDownCapture={(event) => {
        if (RESIZE_KEYS.has(event.key)) {
          beginTerminalResizeInteraction(interactionToken.current);
        }
      }}
      onKeyUpCapture={(event) => {
        if (RESIZE_KEYS.has(event.key)) finish();
      }}
      onBlur={finish}
    />
  );
}

function DropOverlay({ leafId }: { leafId: number }) {
  const active = useTerminalDropStore((s) => s.targetLeafId === leafId);
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-lg border border-primary/45 bg-background/70 text-xs font-medium text-foreground shadow-lg backdrop-blur-sm">
      Drop file path here
    </div>
  );
}
