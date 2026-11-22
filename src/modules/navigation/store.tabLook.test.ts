import { findLeaf } from '@/modules/terminal/lib/panes';
import { beforeEach, describe, expect, it } from 'vitest';
import { initialNavigationData, useNavigationStore } from './store';
import type { TerminalTab } from './types';

const store = () => useNavigationStore.getState();
const tab = (id: number) => store().tabs.find((t) => t.id === id) as TerminalTab;
const titleOf = (tabId: number, leafId: number) =>
  findLeaf(tab(tabId).paneTree, leafId)?.shellTitle;

beforeEach(() => {
  useNavigationStore.setState(initialNavigationData());
  store().markBooted();
});

describe('the title a pane’s shell set', () => {
  it('is kept on the pane and cleared with undefined', () => {
    const leaf = tab(1).activeLeafId;
    store().setLeafShellTitle(leaf, 'vim notes.md');
    expect(titleOf(1, leaf)).toBe('vim notes.md');

    store().setLeafShellTitle(leaf, undefined);
    expect(findLeaf(tab(1).paneTree, leaf)).not.toHaveProperty('shellTitle');
  });

  it('changes nothing when the shell sets the same title again', () => {
    const leaf = tab(1).activeLeafId;
    store().setLeafShellTitle(leaf, 'htop');
    const tabs = store().tabs;
    store().setLeafShellTitle(leaf, 'htop');
    expect(store().tabs).toBe(tabs);
  });

  it('changes nothing when a pane without a title is told it has none', () => {
    const tabs = store().tabs;
    store().setLeafShellTitle(tab(1).activeLeafId, undefined);
    expect(store().tabs).toBe(tabs);
  });

  it('is not carried to a new split', () => {
    store().setLeafShellTitle(tab(1).activeLeafId, 'htop');
    const second = store().splitActivePane(1, 'row');
    if (second === null) throw new Error('Expected a split');
    expect(titleOf(1, second)).toBeUndefined();
  });
});

describe('a tab’s colour', () => {
  it('is set by name or hex and removed with an empty string', () => {
    store().updateTab(1, { color: 'cyan' });
    expect(tab(1).color).toBe('cyan');
    store().updateTab(1, { color: '#ff8800' });
    expect(tab(1).color).toBe('#ff8800');
    store().updateTab(1, { color: '' });
    expect(tab(1)).not.toHaveProperty('color');
  });

  it('is left alone by a patch that does not name it', () => {
    store().updateTab(1, { color: 'red' });
    store().updateTab(1, { customTitle: 'Server' });
    expect(tab(1)).toMatchObject({ color: 'red', customTitle: 'Server' });
  });
});
