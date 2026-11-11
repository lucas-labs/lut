import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import type { TerminalSearchController } from '@/modules/terminal/search/TerminalSearchController';
import { Fragment, useCallback, useEffect, useRef } from 'react';
import type { GroupImperativeHandle, Layout } from 'react-resizable-panels';
import { useTerminalDropStore } from './lib/dropStore';
import { firstLeafSlotId, type PaneNode } from './lib/panes';
import { beginTerminalResizeInteraction, endTerminalResizeInteraction } from './lib/terminalResizeInteraction';
import { TerminalPane, type TerminalPaneHandle } from './TerminalPane';

type LeafBundle = {
  setRef: (h: TerminalPaneHandle | null) => void;
  onSearchReady: (leafId: number, addon: TerminalSearchController) => void;
  onCwd: (leafId: number, cwd: string) => void;
  onExit: (leafId: number, code: number) => void;
};

type Props = {
  node: PaneNode;
  tabVisible: boolean;
  activeLeafId: number;
  onFocusLeaf: (leafId: number) => void;
  getBundle: (leafId: number) => LeafBundle;
  /** The user resized a split: its children's new shares, in child order. */
  onSplitRatios?: (splitId: number, ratios: number[]) => void;
};

type SplitNode = Extract<PaneNode, { kind: 'split' }>;

const panelId = (child: PaneNode) => `pane-slot-${firstLeafSlotId(child)}`;

export function PaneTreeView(props: Props) {
  const { node } = props;
  if (node.kind === 'leaf') {
    const { tabVisible, activeLeafId, onFocusLeaf, getBundle } = props;
    const focused = node.id === activeLeafId;
    const b = getBundle(node.id);
    return (
      <div
        onMouseDownCapture={() => {
          if (!focused) onFocusLeaf(node.id);
        }}
        // Catches focus from Tab, programmatic focus, or any path that
        // skips mousedown — keeps activeLeafId in sync with DOM focus.
        onFocus={() => {
          if (!focused) onFocusLeaf(node.id);
        }}
        data-pane-leaf={node.id}
        className="relative h-full w-full"
      >
        <TerminalPane
          leafId={node.id}
          visible={tabVisible}
          focused={focused}
          initialCwd={node.cwd}
          ref={b.setRef}
          onSearchReady={b.onSearchReady}
          onCwd={b.onCwd}
          onExit={b.onExit}
        />
        <DropOverlay leafId={node.id} />
      </div>
    );
  }

  return <SplitView {...props} node={node} />;
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
            <PaneTreeView {...props} node={child} />
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
