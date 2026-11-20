import { findLeaf } from '@/modules/terminal/lib/panes';
import { beforeEach, describe, expect, it } from 'vitest';
import { initialNavigationData, useNavigationStore } from './store';
import type { TerminalTab } from './types';

const store = () => useNavigationStore.getState();
const tab = (id: number) => store().tabs.find((t) => t.id === id) as TerminalTab;
const profileOf = (tabId: number, leafId: number) =>
  findLeaf(tab(tabId).paneTree, leafId)?.profileId;

beforeEach(() => {
  useNavigationStore.setState(initialNavigationData());
  store().markBooted();
});

describe('the terminal profile of each pane', () => {
  it('remembers the profile a pane opened with, and a split opens with it', () => {
    const first = tab(1).activeLeafId;
    store().setLeafProfile(first, 'detected:wsl:Ubuntu');
    expect(profileOf(1, first)).toBe('detected:wsl:Ubuntu');

    const second = store().splitActivePane(1, 'row');
    if (second === null) throw new Error('Expected a split');
    expect(profileOf(1, second)).toBe('detected:wsl:Ubuntu');
  });

  it('splits a pane that has not opened yet without a profile', () => {
    const second = store().splitActivePane(1, 'col');
    if (second === null) throw new Error('Expected a split');
    expect(profileOf(1, second)).toBeUndefined();
  });

  it('keeps the profile when the pane moves to another tab', () => {
    const second = store().splitActivePane(1, 'row');
    if (second === null) throw new Error('Expected a split');
    store().setLeafProfile(second, 'mine');
    const other = store().newTab();
    store().movePane(second, other);
    expect(profileOf(other, second)).toBe('mine');
  });

  it('leaves the tabs untouched when the profile does not change', () => {
    const first = tab(1).activeLeafId;
    store().setLeafProfile(first, 'mine');
    const before = store().tabs;
    store().setLeafProfile(first, 'mine');
    expect(store().tabs).toBe(before);
  });
});
