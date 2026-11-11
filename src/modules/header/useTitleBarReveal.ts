import { type FocusEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** How long the pointer rests on the top edge before the hidden bar shows. */
export const TITLE_BAR_SHOW_DELAY_MS = 250;
/** How long the bar stays after the pointer leaves it. */
export const TITLE_BAR_HIDE_DELAY_MS = 400;
/** How long the bar shows on launch before hiding, so the user learns it is there. */
export const TITLE_BAR_INTRO_MS = 2500;

/**
 * The vertical-tabs title bar: hidden, shown after the pointer rests on the window's top edge, hidden again shortly
 * after it leaves. It stays while focus is inside it (typing in Search) or while something opened from it holds it.
 * `hidden` false keeps it always shown (the horizontal layout).
 */
export function useTitleBarReveal(hidden: boolean) {
  const [shown, setShown] = useState(true);
  const [holds, setHolds] = useState(0);
  const [focused, setFocused] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearTimers = useCallback(() => {
    clearTimeout(showTimer.current);
    clearTimeout(hideTimer.current);
  }, []);

  // The launch intro: shown at first (the initial state), hidden after a moment unless the pointer is on it by
  // then. Switching the tabs' orientation moves the bar to another slot, so it remounts and plays it again.
  useEffect(() => {
    if (!hidden) return;
    hideTimer.current = setTimeout(() => setShown(false), TITLE_BAR_INTRO_MS);
    return clearTimers;
  }, [hidden, clearTimers]);

  const hold = useCallback(
    (held: boolean) => setHolds((n) => Math.max(0, n + (held ? 1 : -1))),
    [],
  );

  const zoneProps = useMemo(
    () => ({
      onPointerEnter: () => {
        clearTimers();
        showTimer.current = setTimeout(() => setShown(true), TITLE_BAR_SHOW_DELAY_MS);
      },
      onPointerLeave: () => clearTimeout(showTimer.current),
    }),
    [clearTimers],
  );

  const barProps = useMemo(
    () => ({
      // The bar only takes the pointer while visible, so a pointer on it means it is shown.
      onPointerEnter: () => {
        clearTimers();
        setShown(true);
      },
      onPointerLeave: () => {
        clearTimers();
        hideTimer.current = setTimeout(() => setShown(false), TITLE_BAR_HIDE_DELAY_MS);
      },
      onFocus: () => setFocused(true),
      onBlur: (e: FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      },
    }),
    [clearTimers],
  );

  return {
    visible: !hidden || shown || focused || holds > 0,
    zoneProps,
    barProps,
    hold,
  };
}
