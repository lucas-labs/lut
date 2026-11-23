import { buttonVariants } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  TabIcon,
  type TabNavigatorActions,
  type TabNavigatorItem,
  type TabNavigatorOrientation,
  TabStatus,
} from '@/modules/navigation';
import { ShortcutKeys, useShortcutLabel } from '@/modules/shortcuts';
import { colorCss } from '@/modules/theme';
import { CancelCircleIcon, ChevronIcon, PencilIcon, XIcon } from '@lut/lut-icons';
import { type CSSProperties, Fragment, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { NewTabMenu, type NewTabMenuActions } from './NewTabMenu';
import { TabColorMenu } from './TabColorMenu';

/**
 * How the tabs are drawn: the tab orientation's strip or column, or the compact sidebar's rail (E27-02), a column of
 * numbered buttons that behaves as the column does.
 */
export type TabNavigatorLayout = TabNavigatorOrientation | 'compact';

type Props = {
  /** The active space's tabs, in strip order. */
  items: TabNavigatorItem[];
  actions: TabNavigatorActions;
  /** A strip in the title bar, a column beside the workspace, or the compact sidebar's buttons. */
  orientation: TabNavigatorLayout;
  /** The column's heading: the active space's name. */
  heading?: string;
  /** Narrow window: shorter titles in the strip. */
  narrow?: boolean;
  /** The strip's `data-tauri-drag-region` value: "false" while the window is full screen. */
  dragRegion?: '' | 'false';
  newTabMenu: NewTabMenuActions;
};

/** Why a private terminal's tab carries the incognito icon. */
const PRIVATE_TAB_HINT = "This terminal isn't saved in the Space, so it won't come back after a restart.";

const HIDDEN_SCROLLBAR = '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/** A coloured tab's tint (the `data-tab-color` rules of globals.css); nothing for a tab with no colour. */
function tabTint(t: Pick<TabNavigatorItem, 'color'>, orientation: TabNavigatorLayout) {
  const css = t.color === null ? null : colorCss(t.color);
  if (css === null) return {};
  return {
    'data-tab-color': '',
    'data-orientation': orientation,
    style: { '--tab-color': css } as CSSProperties,
  };
}

/** A tab's mark on the compact sidebar: its position 1 to 9, the "Jump to tab" digits; "…" from the 10th on. */
export function tabMark(index: number): string {
  return index < 9 ? String(index + 1) : '…';
}

/**
 * The tabs of the active space, per the E11-02 design: a strip (horizontal) or a column (vertical); or, on the compact
 * sidebar (E27-02), a column of buttons with the tabs' numbers.
 */
export function TabNavigator({ items, actions, orientation, heading, narrow, dragRegion = '', newTabMenu }: Props) {
  // The compact buttons are a column: they take the column's keys, drag and drop mark.
  const vertical = orientation !== 'horizontal';
  const rail = orientation === 'compact';
  const activeId = items.find((t) => t.active)?.id;
  const closeHint = useShortcutLabel('tab.close');
  const jumpHint = useShortcutLabel('tab.selectByIndex');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  // The tab whose menu is open, so applying a custom colour can close it.
  const [menuId, setMenuId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);
  const drag = useRef<{ pointerId: number; start: number; fromId: number; active: boolean } | null>(null);
  // The tab to focus once its rename input is gone, when Enter or Escape ended the edit.
  const refocusId = useRef<number | null>(null);

  const endEdit = (id: number, byKey: boolean) => {
    if (byKey) refocusId.current = id;
    setEditingId(null);
  };

  useEffect(() => {
    if (editingId !== null || refocusId.current === null) return;
    const id = refocusId.current;
    refocusId.current = null;
    scrollRef.current?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.focus();
  }, [editingId]);

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
    rail
      ? cn(
          buttonVariants({ variant: 'rail', size: 'icon-sm' }),
          'group/vt shrink-0',
          !t.active && 'opacity-70 hover:opacity-100',
        )
      : vertical
        ? cn(
            'group/vt flex h-8 w-full min-w-0 shrink-0 items-center gap-2 rounded-md px-2.5 text-left text-sm text-foreground outline-none',
            'hover:bg-accent focus-visible:ring-1 focus-visible:ring-ring',
            // The active tab is ringed and the others' names are dimmed, so it stands out among coloured tabs.
            t.active ? 'bg-accent' : 'opacity-70 hover:opacity-100',
          )
        : cn(
            'relative flex shrink-0 items-center gap-1.5 rounded-t-md px-3 text-xs whitespace-nowrap outline-none',
            'focus-visible:ring-1 focus-visible:ring-ring',
            t.active
              ? 'z-[1] h-[25px] bg-background text-foreground shadow-[inset_1px_0_0_var(--border),inset_-1px_0_0_var(--border),inset_0_1px_0_var(--border)]'
              : 'mb-px h-6 text-muted-foreground hover:bg-accent hover:text-foreground',
          );

  const titleClass = (t: TabNavigatorItem) =>
    cn(
      'truncate',
      vertical ? 'min-w-0 flex-1' : narrow ? 'max-w-48' : 'max-w-80',
      vertical && !t.active && 'text-foreground/55 group-hover/vt:text-foreground',
      t.preview && 'italic',
    );

  const cells = items.map((t, i) => {
    const isNew = !restored.has(t.id);

    // While renaming, the cell is not the tab button: an <input> inside a <button> is invalid HTML, and WebKit
    // blocks focus and selection in it. A compact button has no room for it: its field opens beside it (below).
    if (editingId === t.id && t.renamable && !rail) {
      return (
        <Fragment key={t.id}>
          {showGap(i) && <DropIndicator vertical={vertical} />}
          <div data-tab-id={t.id} className={cellClass(t)} {...tabTint(t, orientation)}>
            <TabIcon id={t.id} />
            <TabRenameInput
              initial={t.title}
              onCommit={(value, byKey) => {
                actions.rename(t.id, value);
                endEdit(t.id, byKey);
              }}
              onCancel={(byKey) => endEdit(t.id, byKey)}
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
        // The compact button's current state (the `rail` button variant) and its name, which shows as a number.
        aria-current={rail && t.active ? 'true' : undefined}
        aria-label={rail ? (t.dirty ? `${t.title}, unsaved changes` : t.title) : undefined}
        tabIndex={t.active ? 0 : -1}
        data-tab-id={t.id}
        {...tabTint(t, orientation)}
        title={t.private && !rail ? PRIVATE_TAB_HINT : undefined}
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
        // A pointer selects on release, above (a drag must not). A click with no pointer behind it (detail 0) is
        // Enter/Space or a screen reader activating the button.
        onClick={(e) => {
          if (e.detail === 0) actions.select(t.id);
        }}
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
        {rail ? (
          <span className={cn('font-mono', !t.active && 'text-foreground/55 group-hover/vt:text-foreground')}>
            {tabMark(i)}
          </span>
        ) : (
          <>
            <TabIcon id={t.id} menu />
            <span className={titleClass(t)}>{t.title}</span>
            {t.dirty ? (
              <span aria-label="Unsaved changes" className="size-1.5 shrink-0 rounded-full bg-foreground/70" />
            ) : null}
            {/* Kept mounted so a screen reader hears the agent state change while the tab stays. */}
            <span aria-live="polite" className="contents">
              <TabStatus id={t.id} />
            </span>
          </>
        )}
      </button>
    );

    const hasTabsAfter = i < items.length - 1;

    const menu = (
      <ContextMenu open={menuId === t.id} onOpenChange={(open) => setMenuId(open ? t.id : null)}>
        <ContextMenuTrigger asChild>
          {rail ? (
            // The rename field (below) opens beside the button, and its tooltip names it.
            <PopoverAnchor asChild>
              <TooltipTrigger asChild>{tab}</TooltipTrigger>
            </PopoverAnchor>
          ) : (
            tab
          )}
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-64" onCloseAutoFocus={(e) => e.preventDefault()}>
          {t.renamable && (
            <ContextMenuItem onSelect={() => setEditingId(t.id)}>
              <PencilIcon size="sm" />
              <span className="flex-1">Rename</span>
            </ContextMenuItem>
          )}
          <TabColorMenu
            color={t.color}
            onChoose={(color) => {
              actions.setColor(t.id, color);
              setMenuId(null);
            }}
          />
          <ContextMenuSeparator />
          <ContextMenuItem disabled={!hasTabsAfter} onSelect={() => actions.closeToEnd(t.id)}>
            <ChevronIcon size="sm" />
            <span className="flex-1">{vertical ? 'Close tabs below' : 'Close tabs to the right'}</span>
          </ContextMenuItem>
          <ContextMenuItem disabled={items.length <= 1} onSelect={() => actions.closeOthers(t.id)}>
            <CancelCircleIcon size="sm" />
            <span className="flex-1">Close other tabs</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={items.length <= 1} onSelect={() => actions.close(t.id)}>
            <XIcon size="sm" />
            <span className="flex-1">Close tab</span>
            {t.active && closeHint ? (
              <ContextMenuShortcut>
                <ShortcutKeys label={closeHint} />
              </ContextMenuShortcut>
            ) : null}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );

    return (
      <Fragment key={t.id}>
        {showGap(i) && <DropIndicator vertical={vertical} />}
        {rail ? (
          <Popover
            open={editingId === t.id}
            onOpenChange={(open) => {
              if (!open) setEditingId(null);
            }}
          >
            <Tooltip>
              {menu}
              {/* The compact button's name, with its state and its "Jump to tab" keys. */}
              <TooltipContent side="right" sideOffset={6}>
                <span className="max-w-56 truncate">{t.title}</span>
                {t.dirty ? <span className="text-muted-foreground">Unsaved changes</span> : null}
                <TabStatus id={t.id} />
                {i < 9 && jumpHint ? (
                  <Kbd>
                    <ShortcutKeys label={jumpHint.replace(/1$/, String(i + 1))} />
                  </Kbd>
                ) : null}
                {t.private ? <span className="max-w-56 text-muted-foreground">{PRIVATE_TAB_HINT}</span> : null}
              </TooltipContent>
            </Tooltip>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={6}
              className="w-56 p-2"
              // It opens while focus is still in the closing menu. Leaving the field ends the rename, as in the column:
              // a click outside blurs it before the popover would drop it.
              onOpenAutoFocus={(e) => e.preventDefault()}
              onFocusOutside={(e) => e.preventDefault()}
              onPointerDownOutside={(e) => e.preventDefault()}
            >
              <TabRenameInput
                initial={t.title}
                className="w-full"
                onCommit={(value, byKey) => {
                  actions.rename(t.id, value);
                  endEdit(t.id, byKey);
                }}
                onCancel={(byKey) => endEdit(t.id, byKey)}
              />
            </PopoverContent>
          </Popover>
        ) : (
          menu
        )}
        {i === items.length - 1 && showGap(items.length) && <DropIndicator vertical={vertical} />}
      </Fragment>
    );
  });

  const newTabButton = <NewTabMenu size={rail ? 'compact' : vertical ? 'rail' : 'strip'} {...newTabMenu} />;

  // The compact sidebar's tabs: the buttons scroll on their own above the +.
  if (rail) {
    return (
      <nav aria-label="Tabs" className="flex min-h-0 flex-col items-center gap-1">
        <div
          ref={scrollRef}
          role="tablist"
          aria-orientation="vertical"
          className={cn('flex min-h-0 flex-col items-center gap-1 overflow-y-auto', HIDDEN_SCROLLBAR)}
        >
          {cells}
        </div>
        <span className="mt-1 flex shrink-0">{newTabButton}</span>
      </nav>
    );
  }

  if (vertical) {
    return (
      <nav aria-label="Tabs" className="flex h-full min-h-0 w-full flex-col">
        <div className="flex h-[30px] shrink-0 items-center gap-2 pr-1.5 pl-[18px]">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{heading}</span>
          {newTabButton}
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
        data-tauri-drag-region={dragRegion}
        className={cn('flex h-full min-w-0 items-end gap-0.5 overflow-x-auto', HIDDEN_SCROLLBAR)}
      >
        {cells}
      </div>
      {newTabButton}
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
  className = 'w-32',
  onCommit,
  onCancel,
}: {
  initial: string;
  className?: string;
  /** `byKey`: Enter or Escape ended the edit (focus goes back to the tab), not a click elsewhere. */
  onCommit: (value: string, byKey: boolean) => void;
  onCancel: (byKey: boolean) => void;
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
    if (!explicit && value.trim() === initial.trim()) finish(() => onCancel(false));
    else finish(() => onCommit(value, explicit));
  };

  return (
    <Input
      ref={ref}
      size="xs"
      defaultValue={initial}
      aria-label="Tab name"
      className={className}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit(e.currentTarget.value, true);
        else if (e.key === 'Escape') finish(() => onCancel(true));
      }}
      onBlur={(e) => {
        // Switching windows/apps blurs the input; keep the edit open instead of resolving it on the way out.
        if (!document.hasFocus()) return;
        commit(e.currentTarget.value, false);
      }}
    />
  );
}
