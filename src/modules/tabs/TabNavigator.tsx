import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import type { AgentLaunchRequest } from '@/modules/agents/lib/launcher';
import {
  TabIcon,
  type TabNavigatorActions,
  type TabNavigatorItem,
  type TabNavigatorOrientation,
  TabStatus,
} from '@/modules/navigation';
import { useShortcutHint } from '@/modules/shortcuts';
import { ArrowRight01Icon, Cancel01Icon, CancelCircleIcon, PencilEdit02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Fragment, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { MENU_CONTENT, MENU_HINT, MENU_ITEM, MENU_SEPARATOR } from './navigatorMenu';
import { NewTabMenu } from './NewTabMenu';

type Props = {
  /** The active space's tabs, in strip order. */
  items: TabNavigatorItem[];
  actions: TabNavigatorActions;
  /** A strip in the title bar, or a rail beside the workspace. */
  orientation: TabNavigatorOrientation;
  /** The rail's heading: the active space's name. */
  heading?: string;
  /** Narrow window: shorter titles in the strip. */
  compact?: boolean;
  onNew: () => void;
  onNewPrivate: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewGitGraph: () => void;
  onLaunchAgents: (request: AgentLaunchRequest) => void;
};

/** Why a private terminal's tab carries the incognito icon. */
const PRIVATE_TAB_HINT = "This terminal isn't saved in the Space, so it won't come back after a restart.";

const HIDDEN_SCROLLBAR = '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** The tabs of the active space, per the E11-02 design: a strip (horizontal) or a rail (vertical). */
export function TabNavigator({
  items,
  actions,
  orientation,
  heading,
  compact,
  onNew,
  onNewPrivate,
  onNewPreview,
  onNewEditor,
  onNewGitGraph,
  onLaunchAgents,
}: Props) {
  const vertical = orientation === 'vertical';
  const activeId = items.find((t) => t.active)?.id;
  const closeHint = useShortcutHint('tab.close');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);
  const drag = useRef<{ pointerId: number; start: number; fromId: number; active: boolean } | null>(null);

  // Play the enter animation only for tabs opened after the first paint, never for the restored set. Cells are
  // keyed, so a switch or a reorder doesn't remount them and doesn't replay it.
  const [restored] = useState(() => new Set(items.map((t) => t.id)));

  /** Pointer position along the navigator: x for the strip, y for the rail. */
  const along = (e: { clientX: number; clientY: number }) => (vertical ? e.clientY : e.clientX);

  const gapAt = (position: number) => {
    const els = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? []);
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      const middle = vertical ? r.top + r.height / 2 : r.left + r.width / 2;
      if (position < middle) return i;
    }
    return els.length;
  };

  const endDrag = (currentTarget: HTMLElement) => {
    const st = drag.current;
    if (st) currentTarget.releasePointerCapture?.(st.pointerId);
    drag.current = null;
    setDraggingId(null);
    setDropGap(null);
    setPageTextSelection(true);
  };

  // Horizontal wheel scroll without holding shift (the rail scrolls natively).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || vertical) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [vertical]);

  // Keep the active tab visible after selection / open.
  useEffect(() => {
    const active = scrollRef.current?.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  /** Arrow keys move to the neighbouring tab, Home/End to the ends, as in a tablist. */
  const onTabKeyDown = (e: KeyboardEvent, index: number) => {
    const prev = vertical ? 'ArrowUp' : 'ArrowLeft';
    const next = vertical ? 'ArrowDown' : 'ArrowRight';
    let target: number | null = null;
    if (e.key === prev) target = Math.max(0, index - 1);
    else if (e.key === next) target = Math.min(items.length - 1, index + 1);
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = items.length - 1;
    if (target === null) return;
    e.preventDefault();
    const id = items[target].id;
    actions.select(id);
    scrollRef.current?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.focus();
  };

  const srcIndex = items.findIndex((x) => x.id === draggingId);
  const showGap = (gap: number) => draggingId !== null && dropGap === gap && gap !== srcIndex && gap !== srcIndex + 1;

  const cellClass = (t: TabNavigatorItem) =>
    vertical
      ? cn(
          'flex h-8 w-full min-w-0 shrink-0 items-center gap-2 rounded-md px-2.5 text-left text-sm text-foreground outline-none',
          'hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring',
          t.active && 'bg-accent',
        )
      : cn(
          'relative flex shrink-0 items-center gap-1.5 rounded-t-md px-3 text-xs whitespace-nowrap outline-none',
          'focus-visible:ring-1 focus-visible:ring-ring',
          t.active
            ? 'z-[1] h-[25px] bg-background text-foreground shadow-[inset_1px_0_0_var(--border),inset_-1px_0_0_var(--border),inset_0_1px_0_var(--border)]'
            : 'mb-px h-6 text-muted-foreground hover:bg-accent hover:text-foreground',
        );

  const titleClass = (t: TabNavigatorItem) =>
    cn('truncate', vertical ? 'min-w-0 flex-1' : compact ? 'max-w-48' : 'max-w-80', t.preview && 'italic');

  const cells = items.map((t, i) => {
    const isNew = !restored.has(t.id);

    // While renaming, the cell is not the tab button: an <input> inside a <button> is invalid HTML, and WebKit
    // blocks focus and selection in it.
    if (editingId === t.id && t.renamable) {
      return (
        <Fragment key={t.id}>
          {showGap(i) && <DropIndicator vertical={vertical} />}
          <div data-tab-id={t.id} className={cellClass(t)}>
            <TabIcon id={t.id} />
            <TabRenameInput
              initial={t.title}
              onCommit={(value) => {
                actions.rename(t.id, value);
                setEditingId(null);
              }}
              onCancel={() => setEditingId(null)}
            />
          </div>
          {i === items.length - 1 && showGap(items.length) && <DropIndicator vertical={vertical} />}
        </Fragment>
      );
    }

    const tab = (
      <button
        type="button"
        role="tab"
        aria-selected={t.active}
        tabIndex={t.active ? 0 : -1}
        data-tab-id={t.id}
        title={t.private ? PRIVATE_TAB_HINT : undefined}
        onKeyDown={(e) => onTabKeyDown(e, i)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
          drag.current = { pointerId: e.pointerId, start: along(e), fromId: t.id, active: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const st = drag.current;
          if (!st || st.pointerId !== e.pointerId) return;
          if (!st.active) {
            if (Math.abs(along(e) - st.start) < 4) return;
            st.active = true;
            setDraggingId(st.fromId);
            setPageTextSelection(false);
          }
          e.preventDefault();
          setDropGap(gapAt(along(e)));
        }}
        onPointerUp={(e) => {
          const st = drag.current;
          if (st?.active && dropGap !== null) actions.reorder(st.fromId, dropGap);
          else if (st && !st.active) actions.select(t.id);
          endDrag(e.currentTarget);
        }}
        onPointerCancel={(e) => endDrag(e.currentTarget)}
        onDoubleClick={() => t.preview && actions.pin(t.id)}
        onAuxClick={(e) => {
          if (e.button === 1 && items.length > 1) {
            e.preventDefault();
            e.stopPropagation();
            actions.close(t.id);
          }
        }}
        // A middle click must not paste or autoscroll, and a grabbed tab only activates on release.
        onMouseDown={(e) => {
          if (e.button === 1) e.preventDefault();
        }}
        className={cn(cellClass(t), isNew && 'lut-tab-in', draggingId === t.id && 'opacity-50')}
      >
        <TabIcon id={t.id} menu />
        <span className={titleClass(t)}>{t.title}</span>
        {t.dirty ? (
          <span aria-label="Unsaved changes" className="size-1.5 shrink-0 rounded-full bg-foreground/70" />
        ) : null}
        <TabStatus id={t.id} />
      </button>
    );

    const hasTabsAfter = i < items.length - 1;

    return (
      <Fragment key={t.id}>
        {showGap(i) && <DropIndicator vertical={vertical} />}
        <ContextMenu>
          <ContextMenuTrigger asChild>{tab}</ContextMenuTrigger>
          <ContextMenuContent className={MENU_CONTENT} onCloseAutoFocus={(e) => e.preventDefault()}>
            {t.renamable && (
              <ContextMenuItem className={MENU_ITEM} onSelect={() => setEditingId(t.id)}>
                <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.5} />
                <span className="flex-1">Rename</span>
              </ContextMenuItem>
            )}
            {t.renamable && <ContextMenuSeparator className={MENU_SEPARATOR} />}
            <ContextMenuItem className={MENU_ITEM} disabled={!hasTabsAfter} onSelect={() => actions.closeToEnd(t.id)}>
              <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.5} />
              <span className="flex-1">{vertical ? 'Close tabs below' : 'Close tabs to the right'}</span>
            </ContextMenuItem>
            <ContextMenuItem
              className={MENU_ITEM}
              disabled={items.length <= 1}
              onSelect={() => actions.closeOthers(t.id)}
            >
              <HugeiconsIcon icon={CancelCircleIcon} size={14} strokeWidth={1.5} />
              <span className="flex-1">Close other tabs</span>
            </ContextMenuItem>
            <ContextMenuSeparator className={MENU_SEPARATOR} />
            <ContextMenuItem className={MENU_ITEM} disabled={items.length <= 1} onSelect={() => actions.close(t.id)}>
              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.75} />
              <span className="flex-1">Close tab</span>
              {t.active && closeHint ? <span className={MENU_HINT}>{closeHint}</span> : null}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {i === items.length - 1 && showGap(items.length) && <DropIndicator vertical={vertical} />}
      </Fragment>
    );
  });

  const newTabMenu = (
    <NewTabMenu
      size={vertical ? 'rail' : 'strip'}
      onNew={onNew}
      onNewPrivate={onNewPrivate}
      onNewPreview={onNewPreview}
      onNewEditor={onNewEditor}
      onNewGitGraph={onNewGitGraph}
      onLaunchAgents={onLaunchAgents}
    />
  );

  if (vertical) {
    return (
      <nav aria-label="Tabs" className="flex h-full min-h-0 w-full flex-col">
        <div className="flex h-[30px] shrink-0 items-center gap-2 pr-1.5 pl-[18px]">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{heading}</span>
          {newTabMenu}
        </div>
        <div
          ref={scrollRef}
          role="tablist"
          aria-orientation="vertical"
          className={cn('flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-1 pb-2', HIDDEN_SCROLLBAR)}
        >
          {cells}
        </div>
      </nav>
    );
  }

  return (
    <div className="flex min-w-0 shrink items-center gap-1 self-stretch">
      <div
        ref={scrollRef}
        role="tablist"
        aria-orientation="horizontal"
        data-tauri-drag-region
        className={cn('flex h-full min-w-0 items-end gap-0.5 overflow-x-auto', HIDDEN_SCROLLBAR)}
      >
        {cells}
      </div>
      {newTabMenu}
    </div>
  );
}

/** Turns text selection off for the page while a tab is dragged, so the drag doesn't select the chrome. */
function setPageTextSelection(on: boolean) {
  document.body.style.userSelect = on ? '' : 'none';
}

function DropIndicator({ vertical }: { vertical: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('shrink-0 self-stretch rounded-full bg-primary', vertical ? 'mx-0.5 h-0.5' : 'my-0.5 w-0.5')}
    />
  );
}

function TabRenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  // Guards against a trailing blur re-resolving an edit that Enter/Escape already finished (Escape must never
  // commit).
  const done = useRef(false);

  useEffect(() => {
    // Focus on the next frame so it runs after the context menu restores focus to its trigger when closing; a
    // synchronous focus would be stolen.
    const raf = requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };

  // explicit = the user pressed Enter, which pins even the unchanged label. A plain blur with no change must not
  // freeze the cwd-derived default into a custom title.
  const commit = (value: string, explicit: boolean) => {
    if (!explicit && value.trim() === initial.trim()) finish(onCancel);
    else finish(() => onCommit(value));
  };

  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label="Tab name"
      className="h-5 w-32 min-w-0 rounded-sm border border-ring bg-background px-1 text-xs text-foreground outline-none"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit(e.currentTarget.value, true);
        else if (e.key === 'Escape') finish(onCancel);
      }}
      onBlur={(e) => {
        // Switching windows/apps blurs the input; keep the edit open instead of resolving it on the way out.
        if (!document.hasFocus()) return;
        commit(e.currentTarget.value, false);
      }}
    />
  );
}
