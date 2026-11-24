import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import type { SidebarViewId } from './types';

const SIDEBAR_DEFAULT_WIDTH = 260;
export const SIDEBAR_MIN_WIDTH = 220;
export const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_WIDTH_STORAGE_KEY = 'lut.sidebar.width';
const SIDEBAR_VIEW_STORAGE_KEY = 'lut.sidebar.view';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'lut.sidebar.collapsed';

export function shouldPersistSidebarWidth(width: number, isUserInteraction: boolean): boolean {
  return isUserInteraction && width > 0;
}

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

function readSidebarWidth(): number {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = stored ? Number.parseInt(stored, 10) : NaN;
    return Number.isFinite(parsed) ? clampSidebarWidth(parsed) : SIDEBAR_DEFAULT_WIDTH;
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function readSidebarView(): SidebarViewId {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_VIEW_STORAGE_KEY);
    if (stored === 'spaces' || stored === 'explorer' || stored === 'source-control') return stored;
  } catch {
    // ignore
  }
  return 'explorer';
}

/** lut starts with terminals only: the sidebar stays collapsed until the user opens it once (E07-04). */
export function sidebarStartsCollapsed(stored: string | null): boolean {
  return stored !== '0';
}

/** Saves a sidebar setting; storage may be unavailable (private mode), and the setting then lasts this session. */
function storeSidebarItem(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // keep the in-memory value
  }
}

function readSidebarHidden(): boolean {
  try {
    return sidebarStartsCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY));
  } catch {
    return true;
  }
}

type FocusableExplorer = {
  focus: () => void;
  isFocused: () => boolean;
};

const isOpen = (panel: PanelImperativeHandle | null) =>
  panel ? panel.getSize().asPercentage > 0 : false;

/**
 * The sidebar's panel and its views, and in compact mode (E27-01) the rail that stands in for it.
 *
 * Two states: whether the sidebar is hidden, or in compact mode the rail (stored, shared by both modes), and whether
 * the views are closed. They are one in full mode. In compact mode the rail comes first and the views open on demand
 * beside it (E27-04), from its buttons or the sidebar's commands: their panel exists only while they are open, it
 * starts closed, and it never stays open without the rail.
 */
export function useSidebarPanel(explorerRef: RefObject<FocusableExplorer | null>, compact = false) {
  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const sidebarWidthRef = useRef(readSidebarWidth());
  const sidebarWidthWriteTimerRef = useRef(0);
  const explorerReturnFocusRef = useRef<HTMLElement | null>(null);
  const [sidebarView, setSidebarViewState] = useState<SidebarViewId>(readSidebarView);
  const [initialSidebarHidden] = useState(readSidebarHidden);
  const hiddenRef = useRef(initialSidebarHidden);
  const [sidebarHidden, setSidebarHidden] = useState(initialSidebarHidden);
  // The views beside the rail in compact mode; each time compact mode starts, they start closed.
  const [compactPanelOpen, setCompactPanelOpen] = useState(false);
  const [panelMode, setPanelMode] = useState(compact);
  if (panelMode !== compact) {
    setPanelMode(compact);
    setCompactPanelOpen(false);
  }
  // The views beside the rail show only with it: a drag on the rail's edge can hide it and bring it back before its
  // release, and only a rail that stays hidden closes them.
  const compactViewsShown = compactPanelOpen && !sidebarHidden;
  // Whether the views are off screen: what is hidden can stop doing background work (fs watchers, git status
  // refreshes).
  const sidebarCollapsed = compact ? !compactViewsShown : sidebarHidden;

  const persistSidebarView = useCallback((view: SidebarViewId) => {
    setSidebarViewState(view);
    storeSidebarItem(SIDEBAR_VIEW_STORAGE_KEY, view);
  }, []);

  /** The sidebar, or the rail, hiding or showing; the views beside the rail hide with it. */
  const persistSidebarHidden = useCallback((hidden: boolean) => {
    if (hiddenRef.current === hidden) return;
    hiddenRef.current = hidden;
    setSidebarHidden(hidden);
    storeSidebarItem(SIDEBAR_COLLAPSED_STORAGE_KEY, hidden ? '1' : '0');
  }, []);

  /** Whether the sidebar, or in compact mode the rail, is shown. */
  const isSidebarOpen = useCallback(
    () => (compact ? !hiddenRef.current : isOpen(sidebarRef.current)),
    [compact],
  );

  /** Shows the sidebar at its last width, or the rail; or hides it. */
  const setSidebarOpen = useCallback(
    (open: boolean) => {
      if (compact) {
        persistSidebarHidden(!open);
        // Hiding the rail closes the views beside it.
        if (!open) setCompactPanelOpen(false);
        return;
      }
      const p = sidebarRef.current;
      if (!p || open === isOpen(p)) return;
      if (open) p.resize(`${sidebarWidthRef.current}px`);
      else p.collapse();
    },
    [compact, persistSidebarHidden],
  );

  const toggleSidebar = useCallback(
    () => setSidebarOpen(!isSidebarOpen()),
    [isSidebarOpen, setSidebarOpen],
  );

  const viewsOpen = useCallback(
    () => (compact ? compactViewsShown : isOpen(sidebarRef.current)),
    [compact, compactViewsShown],
  );

  /** Opens the views at their last width; in compact mode beside the rail, which shows with them. */
  const openViews = useCallback(() => {
    if (compact) {
      persistSidebarHidden(false);
      setCompactPanelOpen(true);
      return;
    }
    const panel = sidebarRef.current;
    if (panel && !isOpen(panel)) panel.resize(`${sidebarWidthRef.current}px`);
  }, [compact, persistSidebarHidden]);

  const closeViews = useCallback(() => {
    if (compact) setCompactPanelOpen(false);
    else sidebarRef.current?.collapse();
  }, [compact]);

  /** In compact mode the spaces live on the rail: asking for them shows the rail, and the views close. */
  const showSpacesOnRail = useCallback(() => {
    persistSidebarHidden(false);
    setCompactPanelOpen(false);
  }, [persistSidebarHidden]);

  const cycleSidebarView = useCallback(
    (view: SidebarViewId) => {
      if (compact && view === 'spaces') {
        showSpacesOnRail();
        return;
      }
      if (!viewsOpen()) {
        openViews();
        if (view !== sidebarView) persistSidebarView(view);
        return;
      }
      if (view === sidebarView) {
        closeViews();
        return;
      }
      persistSidebarView(view);
    },
    [compact, closeViews, openViews, persistSidebarView, showSpacesOnRail, sidebarView, viewsOpen],
  );

  const openSidebarView = useCallback(
    (view: SidebarViewId) => {
      if (compact && view === 'spaces') {
        showSpacesOnRail();
        return;
      }
      openViews();
      if (view !== sidebarView) persistSidebarView(view);
    },
    [compact, openViews, persistSidebarView, showSpacesOnRail, sidebarView],
  );

  const persistSidebarWidth = useCallback((next: number, isUserInteraction: boolean) => {
    if (!shouldPersistSidebarWidth(next, isUserInteraction)) return;
    sidebarWidthRef.current = next;
    if (sidebarWidthWriteTimerRef.current) {
      window.clearTimeout(sidebarWidthWriteTimerRef.current);
    }
    sidebarWidthWriteTimerRef.current = window.setTimeout(() => {
      sidebarWidthWriteTimerRef.current = 0;
      storeSidebarItem(SIDEBAR_WIDTH_STORAGE_KEY, String(next));
    }, 200);
  }, []);

  useEffect(() => {
    return () => {
      if (sidebarWidthWriteTimerRef.current) {
        window.clearTimeout(sidebarWidthWriteTimerRef.current);
      }
    };
  }, []);

  const toggleExplorerFocus = useCallback(() => {
    const explorer = explorerRef.current;
    const collapsed = !viewsOpen();
    if (sidebarView !== 'explorer' || collapsed) {
      if (collapsed) openViews();
      if (sidebarView !== 'explorer') persistSidebarView('explorer');
      const active = document.activeElement;
      explorerReturnFocusRef.current =
        active instanceof HTMLElement && active !== document.body ? active : null;
      requestAnimationFrame(() => explorerRef.current?.focus());
      return;
    }
    if (!explorer) return;
    if (explorer.isFocused()) {
      const target = explorerReturnFocusRef.current;
      explorerReturnFocusRef.current = null;
      if (target && document.body.contains(target)) {
        target.focus();
      } else {
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
      return;
    }
    const active = document.activeElement;
    explorerReturnFocusRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    explorer.focus();
  }, [explorerRef, openViews, persistSidebarView, sidebarView, viewsOpen]);

  return {
    sidebarRef,
    sidebarWidthRef,
    sidebarView,
    sidebarHidden,
    sidebarCollapsed,
    /** In compact mode, whether the views are open beside the rail (and the rail shown). */
    compactPanelOpen: compactViewsShown,
    initialSidebarHidden,
    persistSidebarView,
    persistSidebarHidden,
    setCompactPanelOpen,
    toggleSidebar,
    isSidebarOpen,
    setSidebarOpen,
    cycleSidebarView,
    openSidebarView,
    persistSidebarWidth,
    toggleExplorerFocus,
  };
}
