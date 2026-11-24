import { useRef, useState } from 'react';

export type Keyed<T> = T & { key: string };

/** Saved rows, keyed by their place in the saved list. */
const keyedSaved = <T extends object>(items: T[]): Keyed<T>[] =>
  items.map((item, i) => ({ ...item, key: `saved-${i}` }));

/**
 * Rows edited as a draft, each with a key of its own so a removed row takes its field with it. A list saved
 * elsewhere replaces them; the list this editor sent, coming back saved, leaves them (their keys, focus and any
 * edit made since) as they are.
 */
export function useRows<T extends object>(saved: T[], same: (a: T[], b: T[]) => boolean) {
  const added = useRef(0);
  const [rows, setRows] = useState(() => keyedSaved(saved));
  const [rowsOf, setRowsOf] = useState(saved);
  // The list last sent, as native lists it, until a new list arrives.
  const [sent, setSent] = useState<T[] | null>(null);
  if (!same(saved, rowsOf)) {
    setRowsOf(saved);
    setSent(null);
    if (sent === null || !same(saved, sent)) setRows(keyedSaved(saved));
  }
  const add = (item: T) => {
    added.current += 1;
    setRows([...rows, { ...item, key: `added-${added.current}` }]);
  };
  // Marks `list` sent while its save is on its way; one that failed is forgotten, so it can be sent again.
  const send = (list: T[], result: Promise<boolean> | void) => {
    setSent(list);
    void result?.then((done) => {
      if (!done) setSent((current) => (current === list ? null : current));
    });
  };
  // What the next edit is compared with: the list sent while it is on its way, so going back to the listed one
  // is saved too.
  return { rows, setRows, add, send, last: sent ?? saved };
}

export const blurOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
  if (event.key === 'Enter') event.currentTarget.blur();
};
