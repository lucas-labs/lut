// @vitest-environment happy-dom
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
import { TabNavigator } from './TabNavigator';

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
    reorder: vi.fn<TabNavigatorActions['reorder']>(),
  };
  undoPresenter = registerTabPresenter('terminal', {
    Icon: () => null,
    Status: ({ tab }) => createElement('span', { 'data-status': tab.id }),
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

async function render(orientation: 'horizontal' | 'vertical' = 'horizontal') {
  const noop = () => {};
  await act(async () =>
    root.render(
      createElement(TabNavigator, {
        items: items(),
        actions,
        orientation,
        heading: 'Space',
        onNew: noop,
        onNewPrivate: noop,
        onNewPreview: noop,
        onNewEditor: noop,
        onNewGitGraph: noop,
        onLaunchAgents: noop,
      }),
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
  });

  it('shows the space name and the tabs in a rail when vertical', async () => {
    await render('vertical');
    expect(host.querySelector('[role="tablist"]')?.getAttribute('aria-orientation')).toBe('vertical');
    expect(host.textContent).toContain('Space');
    expect(tabs()).toHaveLength(items().length);
  });
});
