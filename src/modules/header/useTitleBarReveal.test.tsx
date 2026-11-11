// @vitest-environment happy-dom
import { act, createElement, type FocusEvent, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TITLE_BAR_HIDE_DELAY_MS,
  TITLE_BAR_INTRO_MS,
  TITLE_BAR_SHOW_DELAY_MS,
  useTitleBarReveal,
} from './useTitleBarReveal';

type Reveal = ReturnType<typeof useTitleBarReveal>;

const probe: { current: Reveal | null } = { current: null };
const reveal = () => {
  if (!probe.current) throw new Error('Harness not rendered');
  return probe.current;
};
let root: Root;
let host: HTMLElement;

function Harness({ hidden }: { hidden: boolean }) {
  const result = useTitleBarReveal(hidden);
  useLayoutEffect(() => {
    probe.current = result;
  });
  return null;
}

function render(hidden: boolean) {
  act(() => root.render(createElement(Harness, { hidden })));
}

const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

/** Shows the bar the way a user does: the pointer rests on the top edge. */
function revealByHover() {
  act(() => reveal().zoneProps.onPointerEnter());
  wait(TITLE_BAR_SHOW_DELAY_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('useTitleBarReveal', () => {
  it('is always visible when not hidden', () => {
    render(false);
    wait(TITLE_BAR_INTRO_MS * 2);
    expect(reveal().visible).toBe(true);
  });

  it('shows on launch, then hides', () => {
    render(true);
    expect(reveal().visible).toBe(true);
    wait(TITLE_BAR_INTRO_MS);
    expect(reveal().visible).toBe(false);
  });

  it('shows only after the pointer rests on the top edge', () => {
    render(true);
    wait(TITLE_BAR_INTRO_MS);
    act(() => reveal().zoneProps.onPointerEnter());
    wait(TITLE_BAR_SHOW_DELAY_MS - 1);
    expect(reveal().visible).toBe(false);
    wait(1);
    expect(reveal().visible).toBe(true);
  });

  it('does not show when the pointer only passes over the top edge', () => {
    render(true);
    wait(TITLE_BAR_INTRO_MS);
    act(() => reveal().zoneProps.onPointerEnter());
    act(() => reveal().zoneProps.onPointerLeave());
    wait(TITLE_BAR_SHOW_DELAY_MS);
    expect(reveal().visible).toBe(false);
  });

  it('hides a moment after the pointer leaves the bar, and not while it is on it', () => {
    render(true);
    wait(TITLE_BAR_INTRO_MS);
    revealByHover();
    act(() => reveal().barProps.onPointerEnter());
    wait(TITLE_BAR_INTRO_MS);
    expect(reveal().visible).toBe(true);
    act(() => reveal().barProps.onPointerLeave());
    wait(TITLE_BAR_HIDE_DELAY_MS - 1);
    expect(reveal().visible).toBe(true);
    wait(1);
    expect(reveal().visible).toBe(false);
  });

  it('keeps the launch intro while the pointer is on the bar', () => {
    render(true);
    act(() => reveal().barProps.onPointerEnter());
    wait(TITLE_BAR_INTRO_MS);
    expect(reveal().visible).toBe(true);
  });

  it('stays while focus is inside it, so the hidden bar can be typed in', () => {
    render(true);
    wait(TITLE_BAR_INTRO_MS);
    act(() => reveal().barProps.onFocus());
    expect(reveal().visible).toBe(true);
    const outside = { currentTarget: host, relatedTarget: document.body } as unknown as FocusEvent<HTMLElement>;
    act(() => reveal().barProps.onBlur(outside));
    expect(reveal().visible).toBe(false);
  });

  it('stays while something opened from it holds it', () => {
    render(true);
    wait(TITLE_BAR_INTRO_MS);
    revealByHover();
    act(() => reveal().hold(true));
    act(() => reveal().barProps.onPointerLeave());
    wait(TITLE_BAR_HIDE_DELAY_MS);
    expect(reveal().visible).toBe(true);
    act(() => reveal().hold(false));
    expect(reveal().visible).toBe(false);
  });
});
