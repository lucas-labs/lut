// @vitest-environment happy-dom
import type { TabNavigatorItem } from '@/modules/navigation';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FocusCrumbs } from './FocusCrumbs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tab = (id: number, title: string, active = false): TabNavigatorItem => ({
  id,
  kind: 'terminal',
  title,
  detail: null,
  active,
  preview: false,
  dirty: false,
  private: false,
  renamable: true,
  color: null,
});

let host: HTMLDivElement;
let root: Root;
const onSwitchSpace = vi.fn();
const onSelectTab = vi.fn();

beforeEach(() => {
  onSwitchSpace.mockClear();
  onSelectTab.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      createElement(FocusCrumbs, {
        spaces: [
          { id: 'a', name: 'Reforge' },
          { id: 'b', name: 'Docs' },
        ],
        activeSpaceId: 'a',
        onSwitchSpace,
        tabs: [tab(1, 'restore-presets', true), tab(2, 'server')],
        onSelectTab,
      }),
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const segment = (label: string) => {
  const found = host.querySelector(`button[aria-label="${label}"]`);
  if (!found) throw new Error(`no ${label} segment`);
  return found;
};
const openMenu = async (label: string) => {
  await act(async () => {
    segment(label).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
  });
  return [...document.querySelectorAll('[role="menuitemradio"]')] as HTMLElement[];
};

it('reads the active space, then its active tab', () => {
  expect(host.querySelector('nav')?.textContent).toBe('Reforge/restore-presets');
});

it('switches to another space from the space menu', async () => {
  const items = await openMenu('Space: Reforge');
  expect(items.map((i) => i.textContent)).toEqual(['Reforge', 'Docs']);
  expect(items[0].getAttribute('aria-checked')).toBe('true');
  await act(async () => items[1].click());
  expect(onSwitchSpace).toHaveBeenCalledWith('b');
});

it('selects another tab of the space from the tab menu', async () => {
  const items = await openMenu('Tab: restore-presets');
  expect(items.map((i) => i.textContent)).toEqual(['restore-presets', 'server']);
  await act(async () => items[1].click());
  expect(onSelectTab).toHaveBeenCalledWith(2);
});
