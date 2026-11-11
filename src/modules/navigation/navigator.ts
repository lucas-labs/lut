import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { type NavigationState, useNavigationStore } from './store';
import { labelFor } from './tabLabel';
import type { Tab } from './types';

/**
 * What a tab navigator (strip, column, switcher) knows about one tab. Kind-specific data
 * stays behind `kind`: the icon comes from the tab presenter registered for it.
 */
export type TabNavigatorItem = {
  id: number;
  kind: Tab['kind'];
  /** The label: a terminal's custom name or directory, the title otherwise. */
  title: string;
  /** A short hint next to the title: a terminal's directory, a file's folder. */
  detail: string | null;
  active: boolean;
  /** A transient tab the next open of the same kind replaces. */
  preview: boolean;
  /** Unsaved changes. */
  dirty: boolean;
  /** A terminal kept out of the Space. */
  private: boolean;
  /** Takes a custom title. */
  renamable: boolean;
};

/** What a tab navigator can ask for. */
export type TabNavigatorActions = {
  select: (id: number) => void;
  close: (id: number) => void;
  /** Chrome-style: close every tab after this one in its space. */
  closeToEnd: (id: number) => void;
  /** Chrome-style: close every other tab of its space. */
  closeOthers: (id: number) => void;
  /** Keep a preview tab. */
  pin: (id: number) => void;
  /** Set a custom title; an empty string goes back to the default. */
  rename: (id: number, title: string) => void;
  /** Move a tab to an insertion gap (0..n) of its space's strip. */
  reorder: (fromId: number, toGapIndex: number) => void;
};

export type TabNavigatorOrientation = 'horizontal' | 'vertical';

function detailFor(tab: Tab): string | null {
  if (tab.kind === 'terminal') {
    return tab.cwd ? tab.cwd.split(/[\\/]/).filter(Boolean).slice(-2).join('/') || tab.cwd : null;
  }
  if (tab.kind === 'editor' || tab.kind === 'markdown') {
    return tab.path.split(/[\\/]/).filter(Boolean).slice(-2, -1)[0] ?? null;
  }
  return null;
}

function toNavigatorItem(tab: Tab, activeId: number): TabNavigatorItem {
  return {
    id: tab.id,
    kind: tab.kind,
    title: labelFor(tab),
    detail: detailFor(tab),
    active: tab.id === activeId,
    preview: (tab.kind === 'editor' || tab.kind === 'git-diff') && tab.preview,
    dirty: tab.kind === 'editor' && tab.dirty,
    private: tab.kind === 'terminal' && tab.private === true,
    renamable: tab.kind === 'terminal',
  };
}

/** The tabs of one space, in strip order, as navigator items. */
export function selectNavigatorItems(
  state: Pick<NavigationState, 'tabs' | 'activeId'>,
  spaceId: string,
): TabNavigatorItem[] {
  return state.tabs
    .filter((t) => t.spaceId === spaceId)
    .map((t) => toNavigatorItem(t, state.activeId));
}

/** `selectNavigatorItems` for a component: recomputed only when the tabs or the active tab change. */
export function useNavigatorItems(spaceId: string): TabNavigatorItem[] {
  const { tabs, activeId } = useNavigationStore(
    useShallow((s) => ({ tabs: s.tabs, activeId: s.activeId })),
  );
  return useMemo(
    () => selectNavigatorItems({ tabs, activeId }, spaceId),
    [tabs, activeId, spaceId],
  );
}
