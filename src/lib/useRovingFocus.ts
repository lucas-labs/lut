import { type FocusEvent, type KeyboardEvent, useId, useState } from 'react';

/** What an item of a roving group spreads on its element; `onKeyDown` says whether it took the key. */
export type RovingItem = {
  'data-roving-id': string;
  tabIndex: 0 | -1;
  onFocus: () => void;
  onBlur: (e: FocusEvent) => void;
  onKeyDown: (e: KeyboardEvent) => boolean;
};

/**
 * Roving focus over a group of items (WAI-ARIA): the group is one Tab stop, the arrow keys of its orientation move the
 * focus between its items and Home and End to its ends, without wrapping and without activating them. Tab enters the
 * group on `current` (the active item), or on the first one; while the focus is inside, on the focused one.
 *
 * Spread `group` on the element that holds the items and `item(id)` on each.
 */
export function useRovingFocus<T extends string | number>(
  ids: readonly T[],
  current: T | null,
  orientation: 'vertical' | 'horizontal',
) {
  const groupId = useId();
  const [focused, setFocused] = useState<T | null>(null);
  const stop =
    focused !== null && ids.includes(focused)
      ? focused
      : current !== null && ids.includes(current)
        ? current
        : ids[0];
  // Attributes are compared as values, not built into selectors, so no id needs escaping.
  const inGroup = (el: Element | null) => {
    for (let node = el; node; node = node.parentElement) {
      if (node.getAttribute('data-roving-group') === groupId) return node;
    }
    return null;
  };

  const item = (id: T): RovingItem => ({
    'data-roving-id': String(id),
    tabIndex: id === stop ? 0 : -1,
    onFocus: () => setFocused(id),
    // Leaving the group hands its Tab stop back to the active item.
    onBlur: (e) => {
      if (!inGroup(e.relatedTarget as Element | null)) setFocused(null);
    },
    onKeyDown: (e) => {
      const index = ids.indexOf(id);
      const prev = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
      const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
      let target: number;
      if (e.key === prev) target = Math.max(0, index - 1);
      else if (e.key === next) target = Math.min(ids.length - 1, index + 1);
      else if (e.key === 'Home') target = 0;
      else if (e.key === 'End') target = ids.length - 1;
      else return false;
      e.preventDefault();
      const want = String(ids[target]);
      const items =
        inGroup(e.currentTarget as Element)?.querySelectorAll<HTMLElement>('[data-roving-id]') ??
        [];
      Array.from(items)
        .find((el) => el.getAttribute('data-roving-id') === want)
        ?.focus();
      return true;
    },
  });

  return { group: { 'data-roving-group': groupId }, item };
}
