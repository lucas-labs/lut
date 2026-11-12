import { type RefObject, useLayoutEffect, useRef } from 'react';

/**
 * A ref that holds `value` as of the last commit, for callbacks that must keep their identity (a ref callback, a
 * handler given to a long-lived listener) and still see the latest props. Read it in event handlers and effects, never
 * during render. Callbacks called only from effects use `useEffectEvent` instead.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
