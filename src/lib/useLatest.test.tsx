// @vitest-environment happy-dom
import { act, createElement, type RefObject, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { useLatest } from './useLatest';

it('keeps one callback that reads the latest committed value', () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const seen: { read?: () => number; ref?: RefObject<number> } = {};
  function Host({ value }: { value: number }) {
    const latest = useLatest(value);
    const read = useCallback(() => latest.current, [latest]);
    seen.ref = latest;
    seen.read ??= read;
    return null;
  }
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Host, { value: 1 })));
  const firstRef = seen.ref;
  expect(seen.read?.()).toBe(1);
  act(() => root.render(createElement(Host, { value: 2 })));
  expect(seen.ref).toBe(firstRef);
  expect(seen.read?.()).toBe(2);
  act(() => root.unmount());
});
