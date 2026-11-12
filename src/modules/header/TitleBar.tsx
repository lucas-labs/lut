import { WindowControls } from '@/components/WindowControls';
import { IS_MAC, USE_CUSTOM_WINDOW_CONTROLS } from '@/lib/platform';
import { TitleBarHoldProvider } from '@/lib/titleBarHold';
import { dragRegion, useWindowFullScreen } from '@/lib/useWindowFullScreen';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/modules/agents';
import type { AgentLaunchRequest } from '@/modules/agents/lib/launcher';
import type { TabNavigatorActions, TabNavigatorItem } from '@/modules/navigation';
import { TabNavigator } from '@/modules/tabs';
import { SidebarLeftIcon, SlidersHorizontalIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { CwdBreadcrumb } from './CwdBreadcrumb';
import { SearchInline, type SearchInlineHandle, type SearchTarget } from './SearchInline';
import { useTitleBarReveal } from './useTitleBarReveal';

/**
 * Where the bar sits (E11-02): `inline` above the workspace, always shown, carrying the horizontal tabs; `overlay`
 * over the top of the window, hidden until the pointer rests on the top edge (vertical tabs).
 */
export type TitleBarPlacement = 'inline' | 'overlay';

type Props = {
  placement: TitleBarPlacement;
  /** The active space's tabs, for the strip (inline only). */
  tabs: TabNavigatorItem[];
  tabActions: TabNavigatorActions;
  onNew: () => void;
  onNewPrivate: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewGitGraph: () => void;
  onLaunchAgents: (request: AgentLaunchRequest) => void;
  /** False while the sidebar (and the vertical tab rail) are closed. */
  sidePanelsOpen: boolean;
  /** Hides the sidebar (and the vertical tab rail) while either is open, shows them otherwise. */
  onToggleSidebar: () => void;
  onActivateAgent: (tabId: number, leafId: number) => void;
  onOpenSettings: () => void;
  searchTarget: SearchTarget;
  searchRef: RefObject<SearchInlineHandle | null>;
  /** The active terminal's directory, for the breadcrumb. */
  cwd: string | null;
  /** The active file, which the breadcrumb shows instead of `cwd`. */
  filePath: string | null;
  home: string | null;
  /** `cd` the active terminal to a breadcrumb segment. */
  onCd: (path: string) => void;
};

/** Below this width the search collapses to an icon and the tabs get shorter titles. */
const COMPACT_WIDTH = 720;

const ICON_BUTTON =
  'flex shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

/** The window's title bar, per the E11-02 design. */
export function TitleBar(props: Props) {
  const overlay = props.placement === 'overlay';
  const reveal = useTitleBarReveal(overlay);
  const row = <TitleBarRow {...props} />;
  if (!overlay) return row;
  return (
    <TitleBarHoldProvider value={reveal.hold}>
      <div aria-hidden className="absolute inset-x-0 top-0 z-40 h-3" {...reveal.zoneProps} />
      <div
        {...reveal.barProps}
        className={cn(
          'absolute inset-x-0 top-0 z-50 transition-[transform,opacity] duration-160 ease-out motion-reduce:transition-none',
          !reveal.visible && 'pointer-events-none -translate-y-full opacity-0',
        )}
      >
        {row}
      </div>
    </TitleBarHoldProvider>
  );
}

function TitleBarRow({
  placement,
  tabs,
  tabActions,
  onNew,
  onNewPrivate,
  onNewPreview,
  onNewEditor,
  onNewGitGraph,
  onLaunchAgents,
  sidePanelsOpen,
  onToggleSidebar,
  onActivateAgent,
  onOpenSettings,
  searchTarget,
  searchRef,
  cwd,
  filePath,
  home,
  onCd,
}: Props) {
  const inline = placement === 'inline';
  const rootRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const drag = dragRegion(useWindowFullScreen());

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setCompact((entries[0]?.contentRect.width ?? 0) < COMPACT_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // macOS draws its traffic lights over the window's top-left corner: the bar keeps clear of them whenever it
  // reaches that corner (always as an overlay, inline only while the sidebar is closed).
  const clearTrafficLights = IS_MAC && (!inline || !sidePanelsOpen);
  const appMark = (
    <span className="flex shrink-0 items-center gap-1.5 px-2 text-xs text-muted-foreground">
      <img src="/logo.png" alt="" className="size-4" draggable={false} />
      lut
    </span>
  );

  return (
    <div
      ref={rootRef}
      data-tauri-drag-region={drag}
      // Empty chrome falls through to WebKit Reload, which reloads the webview and closes every shell. Menus of
      // the tabs and the breadcrumb still open: Radix handles their triggers before this bubbles.
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        // The bottom line is drawn under the row's content so the active tab can cover it and join the area below.
        'relative flex h-7 shrink-0 items-center gap-0.5 select-none',
        'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border',
        // Inline, the bar is chrome: `frame`, which window vibrancy (Mica) turns transparent. As an overlay it floats
        // over the terminals, so it paints the theme's rail colour, opaque, or the terminal would show through it.
        inline ? 'bg-frame' : 'bg-sidebar',
        clearTrafficLights ? 'pl-20' : 'pl-1.5',
      )}
    >
      {!inline && !IS_MAC && appMark}
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        aria-pressed={sidePanelsOpen}
        title="Toggle sidebar"
        className={cn(ICON_BUTTON, 'size-6')}
      >
        <HugeiconsIcon icon={SidebarLeftIcon} size={14} strokeWidth={1.5} />
      </button>
      {inline && (
        <TabNavigator
          orientation="horizontal"
          items={tabs}
          actions={tabActions}
          compact={compact}
          dragRegion={drag}
          onNew={onNew}
          onNewPrivate={onNewPrivate}
          onNewPreview={onNewPreview}
          onNewEditor={onNewEditor}
          onNewGitGraph={onNewGitGraph}
          onLaunchAgents={onLaunchAgents}
        />
      )}
      <span data-tauri-drag-region={drag} className="h-full min-w-24 flex-1" />
      {/* The path sits by the search, so the left side is the tabs' alone. */}
      <CwdBreadcrumb cwd={cwd} filePath={filePath} home={home} onCd={onCd} />
      <span aria-hidden className="w-1.5 shrink-0" />
      <SearchInline ref={searchRef} target={searchTarget} compact={compact} />
      <NotificationBell onActivate={onActivateAgent} />
      <button
        type="button"
        onClick={onOpenSettings}
        aria-label="Settings"
        title="Settings"
        className={cn(ICON_BUTTON, 'mr-1.5 h-[22px] w-[26px]')}
      >
        <HugeiconsIcon icon={SlidersHorizontalIcon} size={14} strokeWidth={1.5} />
      </button>
      {!inline && IS_MAC && appMark}
      {USE_CUSTOM_WINDOW_CONTROLS && <WindowControls />}
    </div>
  );
}
