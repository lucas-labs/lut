import { useNavigationStore } from '@/modules/navigation';
import type { Tab } from '@/modules/tabs';
import { useCallback, useEffect, useEffectEvent, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { isSerializableTab, serializeTabs } from './serialize';
import { saveState } from './store';
import { useSpaces } from './useSpaces';

const DEBOUNCE_MS = 3000;

type Snapshot = { tabs: Tab[]; activeId: number; activeSpaceId: string };

type Params = {
  activeSpaceId: string;
  /** Gate writes until boot hydration finished, so restore never round-trips. */
  enabled: boolean;
};

type LastWrite = { json: string; activeTabIndex: number };

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
    const groups = new Map<string, Tab[]>();
    for (const t of snap.tabs) {
      const arr = groups.get(t.spaceId);
      if (arr) arr.push(t);
      else groups.set(t.spaceId, [t]);
    }

    for (const [spaceId, group] of groups) {
      const serialized = serializeTabs(group);
      const prev = last.current.get(spaceId);
      let activeTabIndex = prev?.activeTabIndex ?? 0;
      if (spaceId === snap.activeSpaceId) {
        const idx = group.filter(isSerializableTab).findIndex((t) => t.id === snap.activeId);
        if (idx >= 0) activeTabIndex = idx;
      }
      const json = JSON.stringify(serialized);
      if (prev && prev.json === json && prev.activeTabIndex === activeTabIndex) {
        continue;
      }
      last.current.set(spaceId, { json, activeTabIndex });
      void saveState(spaceId, { tabs: serialized, activeTabIndex });
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
