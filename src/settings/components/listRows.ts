import { useRef, useState } from 'react';

export type Keyed<T> = T & { key: string };

/** Saved rows, keyed by their place in the saved list. */
const keyedSaved = <T extends object>(items: T[]): Keyed<T>[] =>
  items.map((item, i) => ({ ...item, key: `saved-${i}` }));

/**
 * Rows edited as a draft, each with a key of its own so a removed row takes its field with it. A list saved
 * elsewhere replaces them; a list this editor sent, coming back saved, leaves them (their keys, focus and any
 * edit made since) as they are, whichever of the lists on their way it is.
 */
export function useRows<T extends object>(saved: T[], same: (a: T[], b: T[]) => boolean) {
  const added = useRef(0);
  const [rows, setRows] = useState(() => keyedSaved(saved));
  const [rowsOf, setRowsOf] = useState(saved);
  // The lists sent and not back yet, oldest first. Saves come back in order: one coming back means the ones
  // sent before it are back too.
  const [inFlight, setInFlight] = useState<T[][]>([]);
  if (!same(saved, rowsOf)) {
    setRowsOf(saved);
    const back = inFlight.findIndex((list) => same(saved, list));
    if (back === -1) setRows(keyedSaved(saved));
    else setInFlight(inFlight.slice(back + 1));
  }
  const add = (item: T) => {
    added.current += 1;
    setRows([...rows, { ...item, key: `added-${added.current}` }]);
  };
  // Marks `list` sent while its save is on its way; one that failed is forgotten, so it can be sent again, and
  // it takes only itself away, never a list sent after it.
  const send = (list: T[], result: Promise<boolean> | void) => {
    setInFlight((lists) => [...lists, list]);
    void result?.then((done) => {
      if (!done) setInFlight((lists) => lists.filter((l) => l !== list));
    });
  };
  // What the next edit is compared with: the last list sent while it is on its way, so going back to the listed
  // one is saved too.
  return { rows, setRows, add, send, last: inFlight[inFlight.length - 1] ?? saved };
}

export const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.currentTarget.blur();
};
