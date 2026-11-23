// @vitest-environment happy-dom
import { TooltipProvider } from '@/components/ui/tooltip';
import type { TabNavigatorItem } from '@/modules/navigation';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompactRail, spaceInitial, tabMark } from './CompactRail';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const onSwitchSpace = vi.fn();
const onNewSpace = vi.fn();
const onRenameSpace = vi.fn();
const onNewTabInSpace = vi.fn();
const onDeleteSpace = vi.fn();
const onSelectTab = vi.fn();
const onNewTab = vi.fn();

const tab = (id: number, active = false, color: string | null = null): TabNavigatorItem => ({
  id,
  kind: 'terminal',
  title: `tab ${id}`,
  detail: null,
  active,
  preview: false,
  dirty: false,
  private: false,
  renamable: true,
  color,
});

function renderRail(tabs: TabNavigatorItem[] | null) {
  act(() =>
    root.render(
      createElement(
        TooltipProvider,
        null,
        createElement(CompactRail, {
          spaces,
          activeSpaceId: 'b',
          onSwitchSpace,
          onNewSpace,
          onRenameSpace,
          onNewTabInSpace,
          onDeleteSpace,
          tabs: tabs && { items: tabs, onSelect: onSelectTab, onNewTab },
        }),
      ),
    ),
  );
}

const spaces = [
  { id: 'a', name: 'api' },
  { id: 'b', name: 'web' },
  { id: 'c', name: '  docs' },
];

beforeEach(() => {
  onSwitchSpace.mockReset();
  onNewSpace.mockReset();
  onRenameSpace.mockReset();
  onNewTabInSpace.mockReset();
  onDeleteSpace.mockReset();
  onSelectTab.mockReset();
  onNewTab.mockReset();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  renderRail(null);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const buttons = () => [...host.querySelectorAll('button')];

describe('CompactRail', () => {
  it('shows each space by its initial, in order, and marks the active one', () => {
    const spaceButtons = buttons().slice(0, spaces.length);
    expect(spaceButtons.map((b) => b.textContent)).toEqual(['A', 'W', 'D']);
    expect(spaceButtons.map((b) => b.getAttribute('aria-label'))).toEqual(['api', 'web', '  docs']);
    expect(spaceButtons.map((b) => b.getAttribute('aria-current'))).toEqual([null, 'true', null]);
  });

  it('switches to a space on click', () => {
    act(() => buttons()[0].click());
    expect(onSwitchSpace).toHaveBeenCalledWith('a');
  });

  it('opens a new space from its last button', () => {
    const plus = buttons()[buttons().length - 1];
    expect(plus?.getAttribute('aria-label')).toBe('Open space');
    act(() => plus?.click());
    expect(onNewSpace).toHaveBeenCalledOnce();
    expect(onSwitchSpace).not.toHaveBeenCalled();
  });
});

describe("CompactRail's space menu", () => {
  const openMenu = async (index: number) => {
    await act(async () => {
      buttons()[index].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 4, clientY: 4 }));
    });
    return [...document.querySelectorAll('[role="menuitem"]')] as HTMLElement[];
  };

  it("offers the Spaces view's actions", async () => {
    const items = await openMenu(1);
    expect(items.map((i) => i.textContent)).toEqual(['Rename space', 'New tab', 'Delete space']);
    await act(async () => items[1].click());
    expect(onNewTabInSpace).toHaveBeenCalledWith('b');
  });

  it('deletes the space', async () => {
    const items = await openMenu(0);
    await act(async () => items[2].click());
    expect(onDeleteSpace).toHaveBeenCalledWith('a');
  });

  it('renames the space from a field beside its button', async () => {
    const items = await openMenu(0);
    await act(async () => items[0].click());
    const field = document.querySelector('input[aria-label="Rename space"]') as HTMLInputElement;
    expect(field.value).toBe('api');
    field.value = '  gateway ';
    await act(async () => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onRenameSpace).toHaveBeenCalledWith('a', 'gateway');
    expect(document.querySelector('input[aria-label="Rename space"]')).toBeNull();
  });
});

describe("CompactRail's tabs (E27-02)", () => {
  const tabButtons = () => [...host.querySelectorAll('[role="tab"]')] as HTMLElement[];
  const group = (slot: string) => host.querySelector(`[data-slot="${slot}"]`);

  it('numbers the tabs 1 to 9, then "…", and selects one on click', () => {
    renderRail(Array.from({ length: 12 }, (_, i) => tab(i + 1, i === 2)));
    expect(tabButtons().map((b) => b.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '…',
      '…',
      '…',
    ]);
    expect(tabButtons().map((b) => b.getAttribute('aria-current'))).toEqual([
      null,
      null,
      'true',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    act(() => tabButtons()[4].click());
    expect(onSelectTab).toHaveBeenCalledWith(5);
  });

  it('tints a coloured tab for the rail and leaves a plain one alone', () => {
    renderRail([tab(1, true, 'red'), tab(2)]);
    const [coloured, plain] = tabButtons();
    expect(coloured.hasAttribute('data-tab-color')).toBe(true);
    expect(coloured.getAttribute('data-orientation')).toBe('rail');
    expect(plain.hasAttribute('data-tab-color')).toBe(false);
  });

  it('opens a tab from its +', () => {
    renderRail([tab(1, true)]);
    act(() => (host.querySelector('button[aria-label="New terminal"]') as HTMLElement).click());
    expect(onNewTab).toHaveBeenCalledOnce();
  });

  it('gives each group at most half the rail with tabs, and the spaces all of it without', () => {
    renderRail([tab(1, true)]);
    expect(group('rail-spaces')?.classList.contains('max-h-1/2')).toBe(true);
    expect(group('rail-tabs')?.classList.contains('max-h-1/2')).toBe(true);
    expect(group('rail-separator')).not.toBeNull();
    renderRail(null);
    expect(group('rail-spaces')?.classList.contains('max-h-1/2')).toBe(false);
    expect(group('rail-tabs')).toBeNull();
    expect(group('rail-separator')).toBeNull();
    expect(tabButtons()).toHaveLength(0);
  });
});

describe('tabMark', () => {
  it('reads the Jump to tab digit, then "…"', () => {
    expect([0, 8, 9, 20].map(tabMark)).toEqual(['1', '9', '…', '…']);
  });
});

describe('spaceInitial', () => {
  it('upper-cases the first character and keeps an emoji whole', () => {
    expect(spaceInitial('lut')).toBe('L');
    expect(spaceInitial(' 🚀 launch')).toBe('🚀');
    expect(spaceInitial('ñandú')).toBe('Ñ');
  });

  it('falls back to a question mark for a blank name', () => {
    expect(spaceInitial('')).toBe('?');
    expect(spaceInitial('   ')).toBe('?');
  });
});
