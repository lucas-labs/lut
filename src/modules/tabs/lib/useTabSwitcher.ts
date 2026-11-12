import { useLatest } from '@/lib/useLatest';
import { useCallback, useEffect, useState } from 'react';

export type TabSwitcherState = { order: number[]; index: number };

type Options = {
  /** Candidate tab ids in MRU order, current tab first. */
  getOrder: () => number[];
  /** Called on commit with the chosen tab id (never the already-active one). */
  onCommit: (id: number) => void;
};

export function useTabSwitcher({ getOrder, onCommit }: Options) {
  const [state, setState] = useState<TabSwitcherState | null>(null);
  const stateRef = useLatest(state);
  const cb = useLatest({ getOrder, onCommit });

  const step = useCallback(
    (delta: 1 | -1) => {
      // Read here, not in the updater: an updater runs during render. Used only when the switcher opens.
      const order = cb.current.getOrder();
      setState((prev) => {
        if (prev) {
          const len = prev.order.length;
          return { ...prev, index: (prev.index + delta + len) % len };
        }
        if (order.length < 2) return null;
        return { order, index: (delta + order.length) % order.length };
      });
    },
    [cb],
  );

  const commit = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    setState(null);
    const id = s.order[s.index];
    if (id !== undefined && id !== s.order[0]) cb.current.onCommit(id);
  }, [stateRef, cb]);

  const cancel = useCallback(() => setState(null), []);

  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => {
      if (!stateRef.current) return;
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) commit();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (stateRef.current && e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        cancel();
      }
    };
    window.addEventListener('keyup', onKeyUp, { capture: true });
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('blur', cancel);
    };
  }, [commit, cancel, stateRef]);

  return { state, step };
}
