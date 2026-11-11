import { usePreferencesStore } from '@/modules/settings/preferences';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initialNavigationData, useNavigationStore } from './store';

vi.mock('@/modules/terminal/lib/terminalSessionApi', () => ({ disposeSession: vi.fn() }));

const store = () => useNavigationStore.getState();
const setOrientation = (tabOrientation: 'horizontal' | 'vertical') =>
  usePreferencesStore.setState({ tabOrientation });

beforeEach(() => {
  useNavigationStore.setState(initialNavigationData());
  store().markBooted();
  setOrientation('horizontal');
});

describe('tab orientation', () => {
  it('leaves order, active tab, panes and indicators untouched', () => {
    const second = store().newTab('/b');
    store().splitActivePane(second, 'row');
    store().newPrivateTab();
    store().setActiveId(second);
    const before = store().tabs;

    setOrientation('vertical');
    expect(store().tabs).toBe(before);
    expect(store().activeId).toBe(second);

    setOrientation('horizontal');
    expect(store().tabs).toBe(before);
  });

  it('keeps ids stable across a close and reopen in either orientation', () => {
    const closing = store().newTab();
    setOrientation('vertical');
    store().closeTab(closing);
    const reopened = store().newTab();
    setOrientation('horizontal');
    expect(reopened).toBeGreaterThan(closing);
    expect(store().tabs.map((t) => t.id)).toEqual([1, reopened]);
    expect(store().activeId).toBe(reopened);
  });
});
