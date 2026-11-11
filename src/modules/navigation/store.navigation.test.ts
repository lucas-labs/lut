import { startSessionReconciler } from '@/modules/sessions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planCloseOtherTabs, planCloseTabsToRight } from './planners/close';
import { switcherOrder } from './planners/order';
import { initialNavigationData, useNavigationStore } from './store';
import type { TerminalTab } from './types';

const dispose = vi.hoisted(() => vi.fn());
vi.mock('@/modules/terminal/lib/terminalSessionApi', () => ({ disposeSession: dispose }));

const store = () => useNavigationStore.getState();
const ids = () => store().tabs.map((t) => t.id);
const leafOf = (id: number) => (store().tabs.find((t) => t.id === id) as TerminalTab).activeLeafId;

let stop: () => void = () => {};

beforeEach(() => {
  useNavigationStore.setState(initialNavigationData());
  store().markBooted();
  stop = startSessionReconciler();
  dispose.mockClear();
});

afterEach(() => stop());

/** Four terminal tabs in the default space: 1 (leaf 2), then three more. */
function fourTabs() {
  const [b, c, d] = [store().newTab(), store().newTab(), store().newTab()];
  return [1, b, c, d] as const;
}

describe('closing tabs', () => {
  it('closes one tab, focuses its left neighbour and disposes only its sessions', () => {
    const [a, b, c] = fourTabs();
    const [lb, lc] = [leafOf(b), leafOf(c)];
    store().setActiveId(c);
    store().closeTab(c);
    expect(ids()).not.toContain(c);
    expect(store().activeId).toBe(b);
    expect(dispose).toHaveBeenCalledExactlyOnceWith(lc);
    expect(dispose).not.toHaveBeenCalledWith(lb);
    expect(ids()[0]).toBe(a);
  });

  it('closes the tabs to the right of one and keeps the anchor active', () => {
    const [a, b, c, d] = fourTabs();
    store().setActiveId(d);
    store().closeTabs(b, planCloseTabsToRight(store().tabs, b, store().activeId));
    expect(ids()).toEqual([a, b]);
    expect(store().activeId).toBe(b);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(ids()).not.toContain(c);
  });

  it('closes every other tab of the space', () => {
    const [, b] = fourTabs();
    store().closeTabs(b, planCloseOtherTabs(store().tabs, b, store().activeId));
    expect(ids()).toEqual([b]);
    expect(store().activeId).toBe(b);
    expect(dispose).toHaveBeenCalledTimes(3);
  });

  it('refuses to close the last tab of a space', () => {
    store().closeTab(1);
    expect(ids()).toEqual([1]);
    expect(dispose).not.toHaveBeenCalled();
  });
});

describe('reordering and switching', () => {
  it('reorders tabs without touching their sessions or the active tab', () => {
    const [a, b, c, d] = fourTabs();
    store().reorderTabByGap(d, 0);
    expect(ids()).toEqual([d, a, b, c]);
    expect(store().activeId).toBe(d);
    expect(dispose).not.toHaveBeenCalled();
  });

  it('orders the switcher by recency and forgets closed tabs', () => {
    const [a, b, c, d] = fourTabs();
    store().setActiveId(b);
    store().setActiveId(a);
    store().closeTab(c);
    expect(switcherOrder(store().tabs, store().mru, store().activeId, 'default')).toEqual([
      a,
      b,
      d,
    ]);
  });
});

describe('cold tabs', () => {
  it('stay cold until activated, and warm only once boot has finished', () => {
    useNavigationStore.setState(initialNavigationData());
    const cold = store().newTabInSpace('default');
    store().setActiveId(cold);
    expect(store().tabs.find((t) => t.id === cold)?.cold).toBe(true);
    store().markBooted();
    expect(store().tabs.find((t) => t.id === cold)?.cold).toBe(false);
    expect(store().tabs.find((t) => t.id === 1)?.cold).toBe(true);
  });
});
