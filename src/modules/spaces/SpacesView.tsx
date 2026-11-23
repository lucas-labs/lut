import { Button, buttonVariants } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { labelFor, type Tab, TabIcon } from '@/modules/navigation';
import { useShellTitlePolicy } from '@/modules/profiles';
import { useShortcutLabel } from '@/modules/shortcuts';
import { ChevronIcon, DeleteIcon, GhostIcon, PencilIcon, PlusIcon, XIcon } from '@lut/lut-icons';
import { type CSSProperties, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { InlineRename } from './components/InlineRename';
import { isEphemeralSpace } from './lib/ephemeral';
import { accentFor, spaceTint } from './lib/spaceColor';
import type { SpaceMeta } from './lib/store';
import { useSpaces } from './lib/useSpaces';

type Props = {
  tabs: Tab[];
  onNewSpace: () => void;
  onDeleteSpace: (id: string) => void;
  onNewTabInSpace: (spaceId: string) => void;
  onJumpTab: (id: number) => void;
  onCloseTab: (id: number) => void;
  onMoveTabToSpace: (tabId: number, spaceId: string) => void;
  onReorderTab: (tabId: number, targetTabId: number, edge: 'top' | 'bottom') => void;
  onReorderSpaces: (orderedIds: string[]) => void;
  /**
   * The compact sidebar's spaces (E27-01): a button per space with its initial, the name in a tooltip, under no
   * heading and over a +. The same menu (less Expand, as no space lists its tabs), rename and drag.
   */
  compact?: boolean;
};

type Edge = 'top' | 'bottom';

const HIDDEN_SCROLLBAR = '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** A space's mark on the compact sidebar: the first character of its name, upper-cased; an emoji stays whole. */
export function spaceInitial(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toUpperCase() : '?';
}

/** Why the ephemeral Space carries its mark (E16-15). */
const EPHEMERAL_SPACE_HINT = "This Space isn't saved: it starts fresh each time lut opens.";

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  kind: 'space' | 'tab';
  id: string | number;
  active: boolean;
};

type DropTarget =
  | { kind: 'space'; spaceId: string; edge: Edge }
  | { kind: 'tab'; tabId: number; edge: Edge }
  | { kind: 'into-space'; spaceId: string };

function subtitleFor(tab: Tab): string | null {
  if (tab.kind === 'terminal') {
    if (!tab.cwd) return null;
    const segs = tab.cwd.split(/[\\/]/).filter(Boolean);
    return segs.slice(-2).join('/') || tab.cwd;
  }
  if (tab.kind === 'editor' || tab.kind === 'markdown') {
    const segs = tab.path.split(/[\\/]/).filter(Boolean);
    return segs.slice(-2, -1)[0] ?? null;
  }
  return null;
}

/** The Spaces view of the sidebar (E07-06): every space with its tabs; drag to reorder spaces or move tabs. */
export function SpacesView({
  tabs,
  onNewSpace,
  onDeleteSpace,
  onNewTabInSpace,
  onJumpTab,
  onCloseTab,
  onMoveTabToSpace,
  onReorderTab,
  onReorderSpaces,
  compact = false,
}: Props) {
  const allowsShellTitle = useShellTitlePolicy();
  const spaces = useSpaces((s) => s.spaces);
  const activeId = useSpaces((s) => s.activeId);
  const setActive = useSpaces((s) => s.setActive);
  const rename = useSpaces((s) => s.rename);
  const shortcut = useShortcutLabel('space.overview');
  const [editingId, setEditingId] = useState<string | null>(null);
  // Every Space starts collapsed; its menu expands it (E18-09).
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const drag = useRef<DragState | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const [dragging, setDragging] = useState<{
    kind: 'space' | 'tab';
    id: string | number;
  } | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const [overlay, setOverlay] = useState<{ x: number; y: number } | null>(null);

  const tabsBySpace = useMemo(() => {
    const m = new Map<string, Tab[]>();
    for (const t of tabs) {
      const arr = m.get(t.spaceId);
      if (arr) arr.push(t);
      else m.set(t.spaceId, [t]);
    }
    return m;
  }, [tabs]);

  const draggedTab = dragging?.kind === 'tab' ? (tabs.find((t) => t.id === dragging.id) ?? null) : null;
  const draggedSpace = dragging?.kind === 'space' ? (spaces.find((s) => s.id === dragging.id) ?? null) : null;

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const endDrag = (el: Element) => {
    const st = drag.current;
    if (st) el.releasePointerCapture?.(st.pointerId);
    drag.current = null;
    dropRef.current = null;
    setDragging(null);
    setDrop(null);
    setOverlay(null);
    document.body.style.userSelect = '';
  };

  const onPointerDown = (e: React.PointerEvent, kind: 'space' | 'tab', id: string | number) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      kind,
      id,
      active: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = drag.current;
    if (!st || st.pointerId !== e.pointerId) return;
    if (!st.active) {
      if (Math.hypot(e.clientX - st.startX, e.clientY - st.startY) < 5) return;
      st.active = true;
      setDragging({ kind: st.kind, id: st.id });
      document.body.style.userSelect = 'none';
    }
    e.preventDefault();
    setOverlay({ x: e.clientX, y: e.clientY });

    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drop]');
    if (!hit) {
      dropRef.current = null;
      setDrop(null);
      return;
    }
    const rect = hit.getBoundingClientRect();
    const edge: Edge = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
    const kind = hit.getAttribute('data-drop');
    let next: DropTarget | null = null;
    if (st.kind === 'space') {
      if (kind === 'space') {
        const spaceId = hit.getAttribute('data-space-id');
        if (spaceId && spaceId !== st.id) next = { kind: 'space', spaceId, edge };
      }
    } else if (kind === 'tab') {
      const tabId = Number(hit.getAttribute('data-tab-id'));
      if (tabId !== st.id) next = { kind: 'tab', tabId, edge };
    } else if (kind === 'space') {
      const spaceId = hit.getAttribute('data-space-id');
      if (spaceId) next = { kind: 'into-space', spaceId };
    }
    dropRef.current = next;
    setDrop(next);
  };

  const commit = () => {
    const st = drag.current;
    const dt = dropRef.current;
    if (!st?.active || !dt) return;
    if (st.kind === 'space' && dt.kind === 'space') {
      const without = spaces.map((s) => s.id).filter((id) => id !== st.id);
      let idx = without.indexOf(dt.spaceId);
      if (idx < 0) return;
      if (dt.edge === 'bottom') idx += 1;
      without.splice(idx, 0, st.id as string);
      onReorderSpaces(without);
    } else if (st.kind === 'tab') {
      if (dt.kind === 'tab') onReorderTab(st.id as number, dt.tabId, dt.edge);
      else if (dt.kind === 'into-space') onMoveTabToSpace(st.id as number, dt.spaceId);
    }
  };

  // A cancelled pointer (the system took it) drops the drag: no reorder, no switch.
  const onPointerCancel = (e: React.PointerEvent) => endDrag(e.currentTarget);

  const onPointerUp = (e: React.PointerEvent, onActivate?: () => void) => {
    const st = drag.current;
    if (st?.active) commit();
    else if (st) onActivate?.();
    endDrag(e.currentTarget);
  };

  const rows = spaces.map((sp) => (
    <SpaceRow
      key={sp.id}
      space={sp}
      compact={compact}
      tabs={tabsBySpace.get(sp.id) ?? []}
      isActive={sp.id === activeId}
      canDelete={spaces.length > 1}
      expanded={expanded.has(sp.id)}
      editing={editingId === sp.id}
      dragging={dragging}
      drop={drop}
      draggingTabFromOther={draggedTab !== null && draggedTab.spaceId !== sp.id}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onToggle={() => toggleExpand(sp.id)}
      onSwitch={() => setActive(sp.id)}
      onStartRename={() => setEditingId(sp.id)}
      onCommitRename={(name) => {
        const v = name.trim();
        if (v) rename(sp.id, v);
        setEditingId(null);
      }}
      onCancelRename={() => setEditingId(null)}
      onDelete={() => onDeleteSpace(sp.id)}
      onNewTab={() => onNewTabInSpace(sp.id)}
      onJumpTab={onJumpTab}
      onCloseTab={onCloseTab}
    />
  ));

  const dragOverlay =
    overlay &&
    (draggedSpace || draggedTab) &&
    createPortal(
      <div className="pointer-events-none fixed z-[60]" style={{ left: overlay.x + 12, top: overlay.y + 8 }}>
        {draggedSpace ? (
          <OverlayChip color={accentFor(draggedSpace)} label={draggedSpace.name} />
        ) : draggedTab ? (
          <OverlayChip tab={draggedTab} label={labelFor(draggedTab, allowsShellTitle)} />
        ) : null}
      </div>,
      document.body,
    );

  // The compact sidebar's spaces: the buttons scroll on their own above the +.
  if (compact) {
    return (
      <div className="flex min-h-0 flex-col items-center gap-1">
        <div className={cn('flex min-h-0 flex-col items-center gap-1 overflow-y-auto', HIDDEN_SCROLLBAR)}>{rows}</div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="rail"
              size="icon-sm"
              aria-label="Open space"
              onClick={onNewSpace}
              className="mt-1 shrink-0"
            >
              <PlusIcon size="sm" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={6}>
            Open space
          </TooltipContent>
        </Tooltip>
        {dragOverlay}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[30px] shrink-0 items-center gap-2 pr-1.5 pl-[18px]">
        <span
          className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
          title={shortcut ? `Spaces (${shortcut})` : undefined}
        >
          Spaces
        </span>
        <Button variant="ghost" size="icon-sm" onClick={onNewSpace} aria-label="New space" title="New space">
          <PlusIcon size="md" />
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-1 pb-2">{rows}</div>
      {dragOverlay}
    </div>
  );
}

type SpaceRowProps = {
  space: SpaceMeta;
  /** The compact sidebar's button (SpacesView's `compact`). */
  compact: boolean;
  tabs: Tab[];
  isActive: boolean;
  canDelete: boolean;
  expanded: boolean;
  editing: boolean;
  dragging: { kind: 'space' | 'tab'; id: string | number } | null;
  drop: DropTarget | null;
  draggingTabFromOther: boolean;
  onPointerDown: (e: React.PointerEvent, kind: 'space' | 'tab', id: string | number) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent, onActivate?: () => void) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onToggle: () => void;
  onSwitch: () => void;
  onStartRename: () => void;
  onCommitRename: (name: string) => void;
  onCancelRename: () => void;
  onDelete: () => void;
  onNewTab: () => void;
  onJumpTab: (id: number) => void;
  onCloseTab: (id: number) => void;
};

function SpaceRow({
  space,
  compact,
  tabs,
  isActive,
  canDelete,
  expanded,
  editing,
  dragging,
  drop,
  draggingTabFromOther,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onToggle,
  onSwitch,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onDelete,
  onNewTab,
  onJumpTab,
  onCloseTab,
}: SpaceRowProps) {
  // Set when the menu's Rename is chosen, so the menu leaves focus on the rename input instead of the row.
  const renaming = useRef(false);
  const isDragging = dragging?.kind === 'space' && dragging.id === space.id;
  const moveTarget = drop?.kind === 'into-space' && drop.spaceId === space.id;
  const reorderEdge = drop?.kind === 'space' && drop.spaceId === space.id ? drop.edge : null;
  // A coloured Space is tinted like a coloured vertical tab; the drop highlight wins while a tab is over it.
  const tint = moveTarget ? null : spaceTint(space);
  const ephemeral = isEphemeralSpace(space.id);

  const row = (
    // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- drag row hosts nested buttons, cannot be a <button>
    <div
      data-drop="space"
      data-space-id={space.id}
      role="button"
      aria-current={isActive ? 'true' : undefined}
      aria-label={compact ? space.name : undefined}
      {...(tint !== null && {
        'data-tab-color': '',
        'data-orientation': compact ? 'compact' : 'vertical',
        style: { '--tab-color': tint } as CSSProperties,
      })}
      tabIndex={editing ? -1 : 0}
      onPointerDown={editing ? undefined : (e) => onPointerDown(e, 'space', space.id)}
      onPointerMove={onPointerMove}
      onPointerUp={editing ? undefined : (e) => onPointerUp(e, onSwitch)}
      onPointerCancel={onPointerCancel}
      // A pointer switches on release, above (a drag must not). Enter and Space activate it as a button; a click with no
      // pointer behind it (detail 0) is a screen reader activating it.
      onKeyDown={(e) => {
        if (editing) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSwitch();
        }
      }}
      onClick={(e) => {
        if (!editing && e.detail === 0) onSwitch();
      }}
      className={
        compact
          ? cn(buttonVariants({ variant: 'rail', size: 'icon-sm' }), 'shrink-0 select-none')
          : cn(
              'relative flex h-8 cursor-pointer select-none items-center gap-2 rounded-md px-2.5 outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring',
              moveTarget
                ? 'bg-primary/10 ring-1 ring-inset ring-primary/40'
                : isActive
                  ? 'bg-accent'
                  : 'hover:bg-accent/50',
            )
      }
    >
      {compact ? (
        <span className="font-semibold">{spaceInitial(space.name)}</span>
      ) : editing ? (
        <InlineRename initial={space.name} onCommit={onCommitRename} onCancel={onCancelRename} className="ml-0.5" />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{space.name}</span>
      )}
      {!compact && !editing && ephemeral && (
        <span title={EPHEMERAL_SPACE_HINT} className="flex shrink-0">
          <GhostIcon size="sm" className="text-muted-foreground opacity-40" aria-hidden />
          <span className="sr-only">{EPHEMERAL_SPACE_HINT}</span>
        </span>
      )}
    </div>
  );

  const menu = (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {compact ? (
          // The rename field (below) opens beside the button, and its tooltip names it.
          <PopoverAnchor asChild>
            <TooltipTrigger asChild>{row}</TooltipTrigger>
          </PopoverAnchor>
        ) : (
          row
        )}
      </ContextMenuTrigger>
      {/* The row stays clean; its actions live here (E18-09). */}
      <ContextMenuContent
        onCloseAutoFocus={(e) => {
          if (!renaming.current) return;
          renaming.current = false;
          e.preventDefault();
        }}
      >
        {/* The compact sidebar lists no space's tabs. */}
        {!compact && (
          <>
            <ContextMenuItem onSelect={onToggle}>
              <ChevronIcon rotate={expanded ? 270 : 90} size="sm" />
              <span className="flex-1">{expanded ? 'Collapse' : 'Expand'}</span>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem
          onSelect={() => {
            renaming.current = true;
            onStartRename();
          }}
        >
          <PencilIcon size="sm" />
          <span className="flex-1">Rename space</span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={onNewTab}>
          <PlusIcon size="sm" />
          <span className="flex-1">New tab</span>
        </ContextMenuItem>
        {canDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={onDelete}>
              <DeleteIcon size="sm" />
              <span className="flex-1">Delete space</span>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );

  if (compact) {
    return (
      <div className={cn('relative flex shrink-0', isDragging && 'opacity-50')}>
        {reorderEdge && <DropLine edge={reorderEdge} />}
        <Popover
          open={editing}
          onOpenChange={(open) => {
            if (!open) onCancelRename();
          }}
        >
          <Tooltip>
            {menu}
            <TooltipContent side="right" sideOffset={6}>
              <span className="max-w-56 truncate">{space.name}</span>
              {ephemeral ? <span className="max-w-56 text-muted-foreground">{EPHEMERAL_SPACE_HINT}</span> : null}
            </TooltipContent>
          </Tooltip>
          <PopoverContent
            side="right"
            align="start"
            sideOffset={6}
            className="w-56 p-2"
            // It opens while focus is still in the closing menu. Leaving the field ends the rename, as in the row: a
            // click outside blurs it before the popover would drop it.
            onOpenAutoFocus={(e) => e.preventDefault()}
            onFocusOutside={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
          >
            <InlineRename initial={space.name} onCommit={onCommitRename} onCancel={onCancelRename} className="w-full" />
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  return (
    <div className={cn('relative', isDragging && 'opacity-50')}>
      {reorderEdge && <DropLine edge={reorderEdge} />}
      {menu}

      {expanded && (
        <div className="flex flex-col gap-px py-0.5 pl-4 pr-0.5">
          {tabs.map((t) => (
            <TabRow
              key={t.id}
              tab={t}
              dragging={dragging}
              drop={drop}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onJump={() => onJumpTab(t.id)}
              onClose={() => onCloseTab(t.id)}
            />
          ))}
          {tabs.length === 0 && (
            <span className="px-2 py-1 text-[10.5px] text-muted-foreground/50">
              {draggingTabFromOther ? 'Drop to move here' : 'No tabs'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function TabRow({
  tab,
  dragging,
  drop,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onJump,
  onClose,
}: {
  tab: Tab;
  dragging: { kind: 'space' | 'tab'; id: string | number } | null;
  drop: DropTarget | null;
  onPointerDown: (e: React.PointerEvent, kind: 'space' | 'tab', id: string | number) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent, onActivate?: () => void) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onJump: () => void;
  onClose: () => void;
}) {
  const allowsShellTitle = useShellTitlePolicy();
  const subtitle = subtitleFor(tab);
  const isDragging = dragging?.kind === 'tab' && dragging.id === tab.id;
  const reorderEdge = drop?.kind === 'tab' && drop.tabId === tab.id ? drop.edge : null;

  return (
    <div className="relative">
      {reorderEdge && <DropLine edge={reorderEdge} />}
      {/* eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- drag row hosts a nested close button, cannot be a <button> */}
      <div
        data-drop="tab"
        data-tab-id={tab.id}
        role="button"
        tabIndex={0}
        onPointerDown={(e) => onPointerDown(e, 'tab', tab.id)}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerUp(e, onJump)}
        onPointerCancel={onPointerCancel}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onJump();
          }
        }}
        className={cn(
          'group/tab relative flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-primary/40',
          isDragging && 'opacity-50',
        )}
      >
        <TabIcon id={tab.id} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[11.5px] leading-tight">{labelFor(tab, allowsShellTitle)}</span>
          {subtitle && <span className="truncate text-[9.5px] leading-tight text-muted-foreground/55">{subtitle}</span>}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          data-no-drag
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          aria-label="Close tab"
          className="opacity-0 group-hover/tab:opacity-70 hover:opacity-100 focus-visible:opacity-100"
        >
          <XIcon size="xs" />
        </Button>
      </div>
    </div>
  );
}

function DropLine({ edge }: { edge: Edge }) {
  return (
    <span
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-primary',
        edge === 'top' ? 'top-0 -translate-y-1/2' : 'bottom-0 translate-y-1/2',
      )}
    />
  );
}

function OverlayChip({ tab, color, label }: { tab?: Tab; color?: string; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-[8px] border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-[0_12px_32px_rgba(0,0,0,0.4)]">
      {tab ? (
        <TabIcon id={tab.id} />
      ) : (
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      )}
      <span className="max-w-44 truncate">{label}</span>
    </div>
  );
}
