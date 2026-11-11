import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { AgentLaunchRequest } from '@/modules/agents/lib/launcher';
import {
  TabIcon,
  type TabNavigatorActions,
  type TabNavigatorItem,
  type TabNavigatorOrientation,
} from '@/modules/navigation';
import { ArrowRight01Icon, Cancel01Icon, CancelCircleIcon, PencilEdit02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NewTabMenu } from './NewTabMenu';

type Props = {
  /** The active space's tabs, in strip order. */
  tabs: TabNavigatorItem[];
  actions: TabNavigatorActions;
  onNew: () => void;
  onNewPrivate: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewGitGraph: () => void;
  onLaunchAgents: (request: AgentLaunchRequest) => void;
  compact?: boolean;
  /** Horizontal strip in the title bar, or a vertical column (E07-05). */
  orientation?: TabNavigatorOrientation;
};

/** Why a private terminal's tab carries the incognito icon. */
const PRIVATE_TAB_HINT = "This terminal isn't saved in the Space, so it won't come back after a restart.";

export function TabBar({
  tabs,
  actions,
  onNew,
  onNewPrivate,
  onNewPreview,
  onNewEditor,
  onNewGitGraph,
  onLaunchAgents,
  compact,
  orientation = 'horizontal',
}: Props) {
  const vertical = orientation === 'vertical';
  const activeId = tabs.find((t) => t.active)?.id;
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropGap, setDropGap] = useState<number | null>(null);
  const drag = useRef<{
    pointerId: number;
    start: number;
    fromId: number;
    active: boolean;
  } | null>(null);

  // Play the enter animation only for tabs opened after the first paint, never
  // the restored set and never on switch/reorder (triggers are keyed, so they
  // don't remount then). The ref is seeded with the initial ids on first render.
  const seenRef = useRef<Set<number> | null>(null);
  const firstRender = seenRef.current === null;
  let seen = seenRef.current;
  if (seen === null) {
    seen = new Set(tabs.map((t) => t.id));
    seenRef.current = seen;
  }
  useEffect(() => {
    seenRef.current = new Set(tabs.map((t) => t.id));
  }, [tabs]);

  // Single shared pill slides to the active tab instead of each tab toggling
  // its own background. Measured relative to the list (its offsetParent) so it
  // scrolls with the strip for free; transform/width only, no layout on siblings.
  const [pill, setPill] = useState<{ offset: number; size: number } | null>(null);
  const [pillReady, setPillReady] = useState(false);

  const measurePill = useCallback(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-tab-active="true"]');
    if (!el) setPill(null);
    else if (vertical) setPill({ offset: el.offsetTop, size: el.offsetHeight });
    else setPill({ offset: el.offsetLeft, size: el.offsetWidth });
  }, [vertical]);

  useLayoutEffect(() => {
    measurePill();
  }, [measurePill, activeId, tabs]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const ro = new ResizeObserver(measurePill);
    ro.observe(list);
    return () => ro.disconnect();
  }, [measurePill]);

  // Hold the transition off until the pill is first placed, so it never slides
  // in from the origin on mount.
  useEffect(() => {
    if (pill && !pillReady) {
      const id = requestAnimationFrame(() => setPillReady(true));
      return () => cancelAnimationFrame(id);
    }
  }, [pill, pillReady]);

  /** Pointer position along the strip: x for a horizontal strip, y for a vertical one. */
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
    document.body.style.userSelect = '';
  };

  // Horizontal wheel scroll without holding shift (a vertical column scrolls natively).
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
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  return (
    <div
      ref={scrollRef}
      data-tauri-drag-region={vertical ? undefined : true}
      className={cn(
        '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        vertical ? 'min-h-0 w-full flex-1 overflow-y-auto' : 'min-w-0 shrink overflow-x-auto',
      )}
    >
      <div className={cn('flex gap-0.5', vertical ? 'w-full flex-col' : 'w-max items-center')}>
        <Tabs
          value={activeId === undefined ? '' : String(activeId)}
          onValueChange={(v) => actions.select(Number(v))}
          orientation={orientation}
          className={vertical ? 'w-full' : undefined}
        >
          <TabsList
            ref={listRef}
            className={cn(
              'relative gap-0.5 bg-transparent p-0',
              vertical ? 'h-auto w-full flex-col items-stretch rounded-none' : 'h-7 w-max',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'pointer-events-none absolute left-0 h-7 rounded-md bg-foreground/[0.07] shadow-sm ring-1 ring-inset ring-foreground/[0.05]',
                vertical ? 'top-0 w-full' : 'top-1/2',
              )}
              style={
                pill
                  ? {
                      ...(vertical
                        ? { height: pill.size, transform: `translateY(${pill.offset}px)` }
                        : { width: pill.size, transform: `translate(${pill.offset}px, -50%)` }),
                      transitionProperty: pillReady ? (vertical ? 'transform, height' : 'transform, width') : 'none',
                      transitionDuration: 'var(--dur-base)',
                      transitionTimingFunction: 'var(--ease-premium)',
                    }
                  : { opacity: 0 }
              }
            />
            {tabs.map((t, i) => {
              const isPreview = t.preview;
              const isActive = t.active;
              const isNew = !firstRender && !seen.has(t.id);

              const srcIndex = tabs.findIndex((x) => x.id === draggingId);
              const showGap = (gap: number) =>
                draggingId !== null && dropGap === gap && gap !== srcIndex && gap !== srcIndex + 1;

              // While renaming, render a non-button cell so the <input> is not
              // nested inside the trigger <button> (invalid HTML, and WebKit
              // blocks focus/selection on inputs inside buttons).
              if (editingId === t.id && t.renamable) {
                return (
                  <Fragment key={t.id}>
                    {showGap(i) && <DropIndicator vertical={vertical} />}
                    <div
                      data-tab-id={t.id}
                      className={cn(
                        'flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-accent text-xs text-foreground',
                        compact ? 'px-1.5' : 'px-2',
                        vertical && 'w-full',
                      )}
                    >
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
                    {i === tabs.length - 1 && showGap(tabs.length) && <DropIndicator vertical={vertical} />}
                  </Fragment>
                );
              }

              const trigger = (
                <TabsTrigger
                  value={String(t.id)}
                  data-tab-id={t.id}
                  data-tab-active={isActive ? 'true' : undefined}
                  title={t.private ? PRIVATE_TAB_HINT : undefined}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    if ((e.target as HTMLElement).closest('[data-no-drag]')) return;
                    drag.current = {
                      pointerId: e.pointerId,
                      start: along(e),
                      fromId: t.id,
                      active: false,
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    const st = drag.current;
                    if (!st || st.pointerId !== e.pointerId) return;
                    if (!st.active) {
                      if (Math.abs(along(e) - st.start) < 4) return;
                      st.active = true;
                      setDraggingId(st.fromId);
                      document.body.style.userSelect = 'none';
                    }
                    e.preventDefault();
                    setDropGap(gapAt(along(e)));
                  }}
                  onPointerUp={(e) => {
                    const st = drag.current;
                    if (st?.active && dropGap !== null) {
                      actions.reorder(st.fromId, dropGap);
                    } else if (st && !st.active) {
                      actions.select(t.id);
                    }
                    endDrag(e.currentTarget);
                  }}
                  onPointerCancel={(e) => endDrag(e.currentTarget)}
                  onDoubleClick={() => isPreview && actions.pin(t.id)}
                  onAuxClick={(e) => {
                    if (e.button === 1 && tabs.length > 1) {
                      e.preventDefault();
                      e.stopPropagation();
                      actions.close(t.id);
                    }
                  }}
                  // Suppress Radix's switch-on-mousedown so a tab grabbed to
                  // drag (or a plain click) only activates on release.
                  onMouseDown={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      return;
                    }
                    if (e.button === 0 && !(e.target as HTMLElement).closest('[data-no-drag]')) {
                      e.preventDefault();
                    }
                  }}
                  className={cn(
                    'group relative z-[1] h-7 shrink-0 justify-between gap-1.5 rounded-md bg-transparent text-xs transition-colors data-active:bg-transparent dark:data-active:bg-transparent',
                    isNew && 'lut-tab-in',
                    isActive
                      ? 'text-foreground dark:text-foreground'
                      : 'text-muted-foreground hover:text-foreground/80 dark:text-muted-foreground',
                    draggingId === t.id && 'opacity-50',
                    compact ? 'px-1.5!' : tabs.length === 1 ? 'px-2!' : 'ps-2! pe-1!',
                    vertical && 'w-full flex-none justify-between rounded-md py-0',
                  )}
                >
                  <span
                    className={cn(
                      'flex min-w-0 items-center gap-1.5',
                      vertical ? 'flex-1' : compact ? 'max-w-48' : 'max-w-80',
                    )}
                  >
                    <TabIcon id={t.id} menu />
                    {/* Preview tabs use italic to signal the transient state,
                        matching the visual convention from VSCode. */}
                    <span className={cn('truncate', isPreview && 'italic')}>{t.title}</span>
                    {t.dirty ? (
                      <span aria-label="Unsaved changes" className="size-1.5 shrink-0 rounded-full bg-foreground/70" />
                    ) : null}
                  </span>
                  {tabs.length > 1 && (
                    <span
                      role="button"
                      aria-label="Close tab"
                      data-no-drag
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        actions.close(t.id);
                      }}
                      className="rounded p-0.5 opacity-0 transition-opacity hover:bg-accent hover:opacity-100 group-hover:opacity-60"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
                    </span>
                  )}
                </TabsTrigger>
              );

              const hasTabsToRight = i < tabs.length - 1;

              const tabNode = (
                <ContextMenu>
                  <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
                  <ContextMenuContent className="min-w-32 p-1" onCloseAutoFocus={(e) => e.preventDefault()}>
                    {t.renamable && (
                      <>
                        <ContextMenuItem
                          className="gap-2 rounded-xl px-2.5 py-1.5 text-[13px]"
                          onSelect={() => setEditingId(t.id)}
                        >
                          <HugeiconsIcon icon={PencilEdit02Icon} size={13} strokeWidth={1.75} />
                          <span className="flex-1">Rename</span>
                        </ContextMenuItem>
                        {tabs.length > 1 && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem
                              className="gap-2 rounded-xl px-2.5 py-1.5 text-[13px]"
                              onSelect={() => actions.close(t.id)}
                            >
                              <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.75} />
                              <span className="flex-1">Close</span>
                            </ContextMenuItem>
                          </>
                        )}
                      </>
                    )}
                    <ContextMenuItem
                      className="gap-2 rounded-xl px-2.5 py-1.5 text-[13px]"
                      disabled={!hasTabsToRight}
                      onSelect={() => actions.closeToEnd(t.id)}
                    >
                      <HugeiconsIcon icon={ArrowRight01Icon} size={13} strokeWidth={1.75} />
                      <span className="flex-1">{vertical ? 'Close tabs below' : 'Close tabs to the right'}</span>
                    </ContextMenuItem>
                    <ContextMenuItem
                      className="gap-2 rounded-xl px-2.5 py-1.5 text-[13px]"
                      disabled={tabs.length <= 1}
                      onSelect={() => actions.closeOthers(t.id)}
                    >
                      <HugeiconsIcon icon={CancelCircleIcon} size={13} strokeWidth={1.75} />
                      <span className="flex-1">Close other tabs</span>
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );

              return (
                <Fragment key={t.id}>
                  {showGap(i) && <DropIndicator vertical={vertical} />}
                  {tabNode}
                  {i === tabs.length - 1 && showGap(tabs.length) && <DropIndicator vertical={vertical} />}
                </Fragment>
              );
            })}
          </TabsList>
        </Tabs>
        <NewTabMenu
          onNew={onNew}
          onNewPrivate={onNewPrivate}
          onNewPreview={onNewPreview}
          onNewEditor={onNewEditor}
          onNewGitGraph={onNewGitGraph}
          onLaunchAgents={onLaunchAgents}
        />
      </div>
    </div>
  );
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
  // Guards against a trailing blur re-resolving an edit that Enter/Escape
  // already finished (Escape must never commit).
  const done = useRef(false);

  useEffect(() => {
    // Focus on the next frame so it runs after the context menu restores focus
    // to its trigger when closing; a synchronous focus would be stolen.
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

  // explicit = the user pressed Enter, which pins even the unchanged label. A
  // plain blur with no change must not freeze the cwd-derived default into a
  // custom title.
  const commit = (value: string, explicit: boolean) => {
    if (!explicit && value.trim() === initial.trim()) finish(onCancel);
    else finish(() => onCommit(value));
  };

  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label="Rename tab"
      className={cn(
        'w-28 min-w-0 rounded-sm bg-background px-1 text-xs text-foreground',
        'outline-none ring-1 ring-border focus:ring-ring',
      )}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit(e.currentTarget.value, true);
        else if (e.key === 'Escape') finish(onCancel);
      }}
      onBlur={(e) => {
        // Switching windows/apps blurs the input; keep the edit open instead
        // of resolving it on the way out.
        if (!document.hasFocus()) return;
        commit(e.currentTarget.value, false);
      }}
    />
  );
}
