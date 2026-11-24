// @vitest-environment happy-dom
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  initialNavigationData,
  registerTabPresenter,
  type TabNavigatorActions,
  type TabNavigatorItem,
  useNavigationStore,
} from '@/modules/navigation';
import { selectNavigatorItems } from '@/modules/navigation/navigator';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { tabMark, TabNavigator, type TabNavigatorLayout } from './TabNavigator';

const store = () => useNavigationStore.getState();
let root: Root;
let host: HTMLElement;
let actions: { [K in keyof TabNavigatorActions]: Mock<TabNavigatorActions[K]> };
let undoPresenter: () => void = () => {};

beforeAll(() => {
  // happy-dom has no pointer capture; the navigator only needs the calls to exist.
  HTMLElement.prototype.setPointerCapture ??= () => {};
  HTMLElement.prototype.releasePointerCapture ??= () => {};
});

beforeEach(() => {
  useNavigationStore.setState(initialNavigationData());
  store().seedLaunchTab();
  store().newTab();
  store().newTab();
  actions = {
    select: vi.fn<TabNavigatorActions['select']>(),
    close: vi.fn<TabNavigatorActions['close']>(),
    closeToEnd: vi.fn<TabNavigatorActions['closeToEnd']>(),
    closeOthers: vi.fn<TabNavigatorActions['closeOthers']>(),
    pin: vi.fn<TabNavigatorActions['pin']>(),
    rename: vi.fn<TabNavigatorActions['rename']>(),
    setColor: vi.fn<TabNavigatorActions['setColor']>(),
    reorder: vi.fn<TabNavigatorActions['reorder']>(),
  };
  undoPresenter = registerTabPresenter('terminal', {
    Icon: () => null,
    Status: ({ tab, as }) => createElement('span', { 'data-status': tab.id, 'data-look': as }),
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  undoPresenter();
});

function items(): TabNavigatorItem[] {
  const s = store();
  return selectNavigatorItems(s, s.activeSpaceId);
}

async function render(orientation: TabNavigatorLayout = 'horizontal', list: TabNavigatorItem[] = items()) {
  const noop = () => {};
  await act(async () =>
    root.render(
      createElement(
        TooltipProvider,
        null,
        createElement(TabNavigator, {
          items: list,
          actions,
          orientation,
          heading: 'Space',
          newTabMenu: {
            onNew: noop,
            onNewWithProfile: noop,
            onSplit: noop,
            canSplit: true,
            onNewPrivate: noop,
            onNewPreview: noop,
            onNewEditor: noop,
            onNewGitGraph: noop,
            onLaunchAgents: noop,
          },
        }),
      ),
    ),
  );
}

const tabs = () => Array.from(host.querySelectorAll<HTMLElement>('[role="tab"]'));

function pointer(el: HTMLElement, type: string, clientX: number) {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX, clientY: 0 }));
}

describe('TabNavigator', () => {
  it('renders one tab per item, in order, with the active one selected', async () => {
    await render();
    const list = items();
    expect(tabs().map((t) => t.textContent)).toEqual(list.map((t) => t.title));
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(list.map((t) => String(t.active)));
  });

  it('has no close button on the tabs', async () => {
    await render();
    expect(host.querySelector('[aria-label="Close tab"]')).toBeNull();
  });

  it("shows each tab's status from its presenter", async () => {
    await render();
    expect(
      Array.from(host.querySelectorAll('[data-status]')).map((s) => Number(s.getAttribute('data-status'))),
    ).toEqual(items().map((t) => t.id));
  });

  it('selects a tab on a plain click', async () => {
    await render();
    const [first] = tabs();
    await act(async () => {
      pointer(first, 'pointerdown', 10);
      pointer(first, 'pointerup', 10);
    });
    expect(actions.select).toHaveBeenCalledWith(items()[0].id);
    expect(actions.reorder).not.toHaveBeenCalled();
  });

  it('reorders a dragged tab to the gap under the pointer', async () => {
    await render();
    const [first] = tabs();
    // happy-dom lays nothing out, so every tab's middle is 0 and the pointer is past them all: the last gap.
    await act(async () => {
      pointer(first, 'pointerdown', 10);
      pointer(first, 'pointermove', 40);
    });
    await act(async () => pointer(first, 'pointerup', 40));
    expect(actions.reorder).toHaveBeenCalledWith(items()[0].id, items().length);
    expect(actions.select).not.toHaveBeenCalled();
  });

  it('selects a tab activated without a pointer (Enter, Space, a screen reader), not on a pointer click', async () => {
    await render();
    await act(async () => {
      tabs()[1].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
    expect(actions.select).not.toHaveBeenCalled();
    await act(async () => {
      tabs()[1].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }));
    });
    expect(actions.select).toHaveBeenCalledExactlyOnceWith(items()[1].id);
  });

  it('closes a tab on a middle click', async () => {
    await render();
    const second = tabs()[1];
    await act(async () => {
      second.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    });
    expect(actions.close).toHaveBeenCalledWith(items()[1].id);
  });

  it('renames a tab from its context menu', async () => {
    await render();
    const second = tabs()[1];
    await act(async () => {
      second.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 5, clientY: 5 }));
    });
    const rename = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (el) => el.textContent === 'Rename',
    );
    expect(rename).toBeDefined();
    await act(async () => rename?.click());
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Tab name"]');
    expect(input).not.toBeNull();
    if (!input) return;
    input.value = 'build';
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    expect(actions.rename).toHaveBeenCalledWith(items()[1].id, 'build');
    // Enter ends the edit from the keyboard, so focus goes back to the tab instead of the document.
    expect(document.activeElement?.getAttribute('data-tab-id')).toBe(String(items()[1].id));
  });

  it('shows the space name and the tabs in a rail when vertical', async () => {
    await render('vertical');
    expect(host.querySelector('[role="tablist"]')?.getAttribute('aria-orientation')).toBe('vertical');
    expect(host.textContent).toContain('Space');
    expect(tabs()).toHaveLength(items().length);
  });

  describe('tab colour', () => {
    async function openMenu(index: number) {
      const tab = tabs()[index];
      await act(async () => {
        tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 5, clientY: 5 }));
      });
    }
    const swatch = (label: string) =>
      document.querySelector<HTMLElement>(`[role="menuitemradio"][aria-label="${label}"]`);
    function type(input: HTMLInputElement, value: string) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    it('offers no colour, the theme colours and a custom one, with none checked by default', async () => {
      await render();
      await openMenu(1);
      const row = document.querySelector('[role="group"][aria-label="Tab color"]');
      expect(
        Array.from(row?.querySelectorAll('[role="menuitemradio"]') ?? []).map((el) => el.getAttribute('aria-label')),
      ).toEqual(['No color', 'Primary', 'Red', 'Yellow', 'Green', 'Cyan', 'Blue', 'Magenta', 'Custom color']);
      expect(swatch('No color')?.getAttribute('aria-checked')).toBe('true');
    });

    it('gives the tab a theme colour by name, and "No color" removes it', async () => {
      await render();
      await openMenu(1);
      await act(async () => swatch('Cyan')?.click());
      expect(actions.setColor).toHaveBeenLastCalledWith(items()[1].id, 'cyan');

      await openMenu(1);
      await act(async () => swatch('No color')?.click());
      expect(actions.setColor).toHaveBeenLastCalledWith(items()[1].id, null);
    });

    it('applies a custom colour from the picker as hex and closes the menu', async () => {
      await render();
      await openMenu(1);
      await act(async () => swatch('Custom color')?.click());
      const hex = document.querySelector<HTMLInputElement>('input[aria-label="Hex color"]');
      expect(hex).not.toBeNull();
      if (!hex) return;
      const apply = () =>
        Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) => b.textContent === 'Apply');

      await act(async () => type(hex, 'nope'));
      expect(apply()?.disabled).toBe(true);

      await act(async () => type(hex, 'FF8800'));
      await act(async () => apply()?.click());
      expect(actions.setColor).toHaveBeenLastCalledWith(items()[1].id, '#ff8800');
      expect(document.querySelector('input[aria-label="Hex color"]')).toBeNull();
    });

    it('checks the custom swatch for a hex colour and paints it', async () => {
      store().updateTab(items()[1].id, { color: '#ff8800' });
      await render();
      await openMenu(1);
      const custom = swatch('Custom color');
      expect(custom?.getAttribute('aria-checked')).toBe('true');
      expect(custom?.querySelector<HTMLElement>('[data-slot="color-swatch"]')?.style.background).toBe('#ff8800');
    });

    it.each(['horizontal', 'vertical', 'compact'] as const)(
      'tints a coloured tab in the %s navigator',
      async (orientation) => {
        store().updateTab(items()[1].id, { color: 'cyan' });
        await render(orientation);
        const [plain, coloured] = tabs();
        expect(plain.hasAttribute('data-tab-color')).toBe(false);
        expect(coloured.hasAttribute('data-tab-color')).toBe(true);
        expect(coloured.dataset.orientation).toBe(orientation);
        expect(coloured.style.getPropertyValue('--tab-color')).toBe('var(--terminal-ansi-cyan)');
      },
    );
  });
});

describe('TabNavigator on the compact sidebar (E27-02)', () => {
  const pointerY = (el: HTMLElement, type: string, clientY: number) =>
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX: 0, clientY }));

  it('numbers the tabs 1 to 9, then "…", names them and marks the active one', async () => {
    for (let i = 0; i < 9; i++) store().newTab();
    await render('compact');
    const list = items();
    expect(list).toHaveLength(12);
    expect(tabs().map((t) => t.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '…', '…', '…']);
    expect(tabs().map((t) => t.getAttribute('aria-label'))).toEqual(list.map((t) => t.title));
    expect(tabs().map((t) => t.getAttribute('aria-current'))).toEqual(list.map((t) => (t.active ? 'true' : null)));
    expect(host.querySelector('[role="tablist"]')?.getAttribute('aria-orientation')).toBe('vertical');
  });

  it("selects on a click, closes on a middle click and moves with the column's arrow keys", async () => {
    await render('compact');
    await act(async () => {
      pointerY(tabs()[0], 'pointerdown', 10);
      pointerY(tabs()[0], 'pointerup', 10);
    });
    expect(actions.select).toHaveBeenLastCalledWith(items()[0].id);
    await act(async () => {
      tabs()[1].dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    });
    expect(actions.close).toHaveBeenCalledWith(items()[1].id);
    await act(async () => {
      tabs()[0].dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
    });
    expect(actions.select).toHaveBeenLastCalledWith(items()[1].id);
  });

  it('reorders a tab dragged along the rail', async () => {
    await render('compact');
    const [first] = tabs();
    // happy-dom lays nothing out, so every tab's middle is 0 and the pointer is past them all: the last gap.
    await act(async () => {
      pointerY(first, 'pointerdown', 10);
      pointerY(first, 'pointermove', 40);
    });
    await act(async () => pointerY(first, 'pointerup', 40));
    expect(actions.reorder).toHaveBeenCalledWith(items()[0].id, items().length);
  });

  it("opens the tab column's menu and renames the tab in a field beside its button", async () => {
    await render('compact');
    await act(async () => {
      tabs()[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 5, clientY: 5 }));
    });
    const menuItems = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    expect(menuItems.map((el) => el.textContent)).toEqual([
      'Rename',
      'Close tabs below',
      'Close other tabs',
      'Close tab',
    ]);
    await act(async () => menuItems[0].click());
    // The button stays; the field opens outside the rail.
    expect(tabs()).toHaveLength(items().length);
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Tab name"]');
    expect(input).not.toBeNull();
    expect(host.contains(input)).toBe(false);
    if (!input) return;
    input.value = 'build';
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    expect(actions.rename).toHaveBeenCalledWith(items()[1].id, 'build');
    expect(document.querySelector('input[aria-label="Tab name"]')).toBeNull();
  });

  it('keeps each tab state in a hidden live region, so it is heard while the tooltip is closed', async () => {
    await render('compact');
    const live = tabs().map((t) => t.querySelector('[aria-live="polite"]'));
    expect(live.map((l) => l?.querySelector('[data-status]')?.getAttribute('data-status'))).toEqual(
      items().map((t) => String(t.id)),
    );
  });

  it("puts each tab's state on its button as a dot and in its tooltip as words (E27-03)", async () => {
    await render('compact');
    const dots = tabs().map((t) => t.querySelector(':scope > [data-status]'));
    expect(dots.map((d) => d?.getAttribute('data-look'))).toEqual(items().map(() => 'dot'));
    expect(dots.map((d) => d?.getAttribute('data-status'))).toEqual(items().map((t) => String(t.id)));
    expect(tabs()[0].querySelector('[aria-live="polite"] [data-status]')?.getAttribute('data-look')).toBe('icon');

    await act(async () => tabs()[1].focus());
    const label = document.querySelector('[data-slot="tooltip-content"] [data-status]');
    expect(label?.getAttribute('data-look')).toBe('label');
    expect(label?.getAttribute('data-status')).toBe(String(items()[1].id));
  });

  it('keeps renaming while Enter confirms an IME candidate', async () => {
    await render('compact');
    await act(async () => {
      tabs()[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2, clientX: 5, clientY: 5 }));
    });
    const rename = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find(
      (el) => el.textContent === 'Rename',
    );
    await act(async () => rename?.click());
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Tab name"]');
    if (!input) throw new Error('no field');
    input.value = 'ビルド';
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', isComposing: true }));
    });
    expect(actions.rename).not.toHaveBeenCalled();
    expect(document.querySelector('input[aria-label="Tab name"]')).not.toBeNull();
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    expect(actions.rename).toHaveBeenCalledWith(items()[1].id, 'ビルド');
  });

  it('names a tab with unsaved changes as such, keeping its number', async () => {
    const list = items().map((t, i) => ({ ...t, dirty: i === 1 }));
    await render('compact', list);
    expect(tabs()[1].textContent).toBe('2');
    expect(tabs()[1].getAttribute('aria-label')).toBe(`${list[1].title}, unsaved changes`);
    expect(tabs()[0].getAttribute('aria-label')).toBe(list[0].title);
  });

  it("opens the new-tab menu from the rail's + (E27-08)", async () => {
    await render('compact');
    const plus = host.querySelector<HTMLElement>('[aria-label="New tab"]');
    expect(plus?.getAttribute('data-variant')).toBe('rail');
  });
});

describe('tabMark', () => {
  it('reads the Jump to tab digit, then "…"', () => {
    expect([0, 8, 9, 20].map(tabMark)).toEqual(['1', '9', '…', '…']);
  });
});
