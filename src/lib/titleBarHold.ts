import { createContext, useContext, useEffect } from 'react';

/** Keeps a hidden title bar shown; a menu or popover opened from the bar calls it while open. */
const TitleBarHold = createContext<(held: boolean) => void>(() => {});

export const TitleBarHoldProvider = TitleBarHold.Provider;

/** Keeps the title bar shown while `open` is true. Outside a hidden bar it does nothing. */
export function useHoldTitleBar(open: boolean): void {
  const hold = useContext(TitleBarHold);
  useEffect(() => {
    if (!open) return;
    hold(true);
    return () => hold(false);
  }, [open, hold]);
}
