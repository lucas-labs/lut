import { useCallback, useRef, useState } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';

export const TABS_COLUMN_MIN_WIDTH = 140;
export const TABS_COLUMN_MAX_WIDTH = 360;
const TABS_COLUMN_DEFAULT_WIDTH = 200;
const TABS_COLUMN_WIDTH_STORAGE_KEY = 'lut.tabs.columnWidth';
const TABS_COLUMN_COLLAPSED_STORAGE_KEY = 'lut.tabs.columnCollapsed';

function clampTabsColumnWidth(width: number): number {
  return Math.min(TABS_COLUMN_MAX_WIDTH, Math.max(TABS_COLUMN_MIN_WIDTH, Math.round(width)));
}

/** A stored width, clamped; the default when nothing valid is stored. */
export function parseTabsColumnWidth(stored: string | null): number {
  const parsed = stored ? Number.parseInt(stored, 10) : NaN;
  return Number.isFinite(parsed) ? clampTabsColumnWidth(parsed) : TABS_COLUMN_DEFAULT_WIDTH;
}

function read<T>(key: string, parse: (stored: string | null) => T, fallback: T): T {
  try {
    return parse(window.localStorage.getItem(key));
  } catch {
    return fallback;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage may fail in private mode
  }
}

/**
 * The vertical tab column (E07-05): its width and whether it is collapsed are restored on start and saved when the
 * user drags its edge or toggles it. Collapsing works like the sidebar: drag it closed, or toggle it.
 */
export function useTabsColumn() {
  const tabsColumnRef = useRef<PanelImperativeHandle | null>(null);
  const [layout, setLayout] = useState(() => ({
    width: read(TABS_COLUMN_WIDTH_STORAGE_KEY, parseTabsColumnWidth, TABS_COLUMN_DEFAULT_WIDTH),
    collapsed: read(TABS_COLUMN_COLLAPSED_STORAGE_KEY, (stored) => stored === '1', false),
  }));
  // Read by the toggle, which runs outside render.
  const widthRef = useRef(layout.width);

  const persistTabsColumnLayout = useCallback((width: number, isUserInteraction: boolean) => {
    const collapsed = width <= 0;
    const nextWidth =
      isUserInteraction && !collapsed ? clampTabsColumnWidth(width) : widthRef.current;
    widthRef.current = nextWidth;
    setLayout((prev) => {
      if (prev.collapsed === collapsed && prev.width === nextWidth) return prev;
      if (prev.collapsed !== collapsed)
        write(TABS_COLUMN_COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
      if (prev.width !== nextWidth) write(TABS_COLUMN_WIDTH_STORAGE_KEY, String(nextWidth));
      return { width: nextWidth, collapsed };
    });
  }, []);

  const isTabsColumnOpen = useCallback(() => {
    const panel = tabsColumnRef.current;
    return panel ? panel.getSize().inPixels > 0 : false;
  }, []);

  /** Opens the column at its last width, or collapses it. */
  const setTabsColumnOpen = useCallback((open: boolean) => {
    const panel = tabsColumnRef.current;
    if (!panel || open === panel.getSize().inPixels > 0) return;
    if (open) panel.resize(`${widthRef.current}px`);
    else panel.collapse();
  }, []);

  const toggleTabsColumn = useCallback(
    () => setTabsColumnOpen(!isTabsColumnOpen()),
    [isTabsColumnOpen, setTabsColumnOpen],
  );

  return {
    tabsColumnRef,
    tabsColumnInitialWidth: layout.collapsed ? 0 : layout.width,
    persistTabsColumnLayout,
    toggleTabsColumn,
    isTabsColumnOpen,
    setTabsColumnOpen,
  };
}
