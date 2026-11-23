import { useNavigationStore } from '@/modules/navigation';
import type { Tab } from '@/modules/tabs';
import { useCallback, useEffect, useEffectEvent, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EPHEMERAL_SPACE_ID } from './ephemeral';
import { isSerializableTab, serializeTabs } from './serialize';
import { saveState, type SpaceState } from './store';
import { useSpaces } from './useSpaces';

const DEBOUNCE_MS = 3000;

export type Snapshot = { tabs: Tab[]; activeId: number; activeSpaceId: string };

type Params = {
  activeSpaceId: string;
  /** Gate writes until boot hydration finished, so restore never round-trips. */
  enabled: boolean;
};

export type LastWrite = { json: string; activeTabIndex: number };

/**
 * What changed since the last writes (`last`, updated here): each Space's tabs and active tab. The ephemeral Space is
 * left out (E16-15); a saved Space whose tabs all moved to another Space is written empty, else its old tabs would
 * come back at the next start.
 */
export function spaceWrites(
  snap: Snapshot,
  spaceIds: string[],
  last: Map<string, LastWrite>,
): { spaceId: string; state: SpaceState }[] {
  const groups = new Map<string, Tab[]>();
  for (const t of snap.tabs) {
    const arr = groups.get(t.spaceId);
    if (arr) arr.push(t);
    else groups.set(t.spaceId, [t]);
  }
  for (const id of spaceIds) {
    if (!groups.has(id) && last.has(id)) groups.set(id, []);
  }
  groups.delete(EPHEMERAL_SPACE_ID);

  const writes: { spaceId: string; state: SpaceState }[] = [];
  for (const [spaceId, group] of groups) {
    const serialized = serializeTabs(group);
    const prev = last.get(spaceId);
    let activeTabIndex = serialized.length === 0 ? 0 : (prev?.activeTabIndex ?? 0);
    if (spaceId === snap.activeSpaceId) {
      const idx = group.filter(isSerializableTab).findIndex((t) => t.id === snap.activeId);
      if (idx >= 0) activeTabIndex = idx;
    }
    const json = JSON.stringify(serialized);
    if (prev && prev.json === json && prev.activeTabIndex === activeTabIndex) continue;
    last.set(spaceId, { json, activeTabIndex });
    writes.push({ spaceId, state: { tabs: serialized, activeTabIndex } });
  }
  return writes;
}

/** Saves each space's tabs (from the navigation store) a while after they change. */
export function useSpacePersistence({ activeSpaceId, enabled }: Params) {
  const { tabs, activeId } = useNavigationStore(
    useShallow((s) => ({ tabs: s.tabs, activeId: s.activeId })),
  );
  const last = useRef<Map<string, LastWrite>>(new Map());
  const seeded = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed each space's last-known active index from disk so the first flush
  // preserves it for spaces the user never opens (empty json forces one write
  // with the correct index rather than clobbering it to 0). Declared before the
  // effects that flush, so it runs first.
  useEffect(() => {
    if (!enabled || seeded.current) return;
    seeded.current = true;
    for (const [id, idx] of Object.entries(useSpaces.getState().initialActiveIndex)) {
      last.current.set(id, { json: '', activeTabIndex: idx });
    }
  }, [enabled]);

  const flush = useCallback((snap: Snapshot) => {
    const spaceIds = useSpaces.getState().spaces.map((s) => s.id);
    for (const { spaceId, state } of spaceWrites(snap, spaceIds, last.current)) {
      void saveState(spaceId, state);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const snap: Snapshot = { tabs, activeId, activeSpaceId };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      flush(snap);
    }, DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [tabs, activeId, activeSpaceId, enabled, flush]);

  // Saves what is on screen now: when the window hides or closes, and when persistence stops.
  const flushNow = useEffectEvent(() => flush({ tabs, activeId, activeSpaceId }));

  useEffect(() => {
    if (!enabled) return;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushNow();
    };
    const onLeave = () => flushNow();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', onLeave);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('beforeunload', onLeave);
      flushNow();
    };
  }, [enabled]);
}
