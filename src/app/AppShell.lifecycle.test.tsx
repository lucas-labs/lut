// @vitest-environment happy-dom
import { SidebarViewHeader } from '@/modules/sidebar';
import { act, createElement, createRef, type ReactNode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

/** Each panel's distinct `defaultSize` values, in the order the library's `Panel` received them. */
const panelSizes = vi.hoisted(() => new Map<string, unknown[]>());

vi.mock('react-resizable-panels', async (original) => {
  const lib = await original<typeof import('react-resizable-panels')>();
  const { createElement } = await import('react');
  function Panel(props: Parameters<typeof lib.Panel>[0]) {
    const seen = panelSizes.get(props.id ?? '') ?? [];
    if (seen[seen.length - 1] !== props.defaultSize) panelSizes.set(props.id ?? '', [...seen, props.defaultSize]);
    return createElement(lib.Panel, props);
  }
  return { ...lib, Panel };
});

const mounts: string[] = [];
const unmounts: string[] = [];

/** Stands in for the TerminalStack: records when React mounts or unmounts it. */
function Probe({ name }: { name: string }) {
  useEffect(() => {
    mounts.push(name);
    return () => {
      unmounts.push(name);
    };
  }, [name]);
  return createElement('div', { 'data-probe': name });
}

let root: Root;
let host: HTMLElement;
const sidebarRef = createRef<PanelImperativeHandle>();

function shell(props: {
  focusMode?: boolean;
  fullScreen?: boolean;
  compact?: boolean;
  titleBar?: ReactNode;
  placement?: 'inline' | 'overlay';
  sidebar?: ReactNode;
  sidebarWidth?: number;
  /** Compact mode: whether the views are open beside the rail. */
  views?: boolean;
  /** Whether the sidebar, or the rail, is shown. */
  sidebarOpen?: boolean;
  onSidebarHiddenChange?: (hidden: boolean) => void;
  onCompactPanelChange?: (open: boolean) => void;
  tabsColumn?: ReactNode;
  tabsColumnWidth?: number;
}) {
  return createElement(AppShell, {
    focusMode: props.focusMode ?? false,
    fullScreen: props.fullScreen ?? false,
    compact: props.compact ?? false,
    rail: createElement('nav', { 'data-chrome': 'rail' }),
    sidebarWidth: 260,
    compactPanelOpen: props.views ?? false,
    onCompactPanelChange: props.onCompactPanelChange ?? (() => {}),
    titleBar: props.titleBar ?? null,
    titleBarPlacement: props.placement ?? 'inline',
    tabsColumn: props.tabsColumn ?? null,
    sidebarOpen: props.sidebarOpen ?? true,
    tabsColumnOpen: true,
    tabsColumnRef: createRef<PanelImperativeHandle>(),
    tabsColumnInitialWidth: props.tabsColumnWidth ?? 200,
    onTabsColumnLayout: () => {},
    sidebar: props.sidebar ?? null,
    sidebarRef,
    sidebarInitialWidth: props.sidebarWidth ?? 0,
    onSidebarLayout: () => {},
    onSidebarHiddenChange: props.onSidebarHiddenChange ?? (() => {}),
    workspace: createElement(Probe, { name: 'workspace' }),
  });
}

function render(node: ReactNode) {
  act(() => root.render(node));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  mounts.length = 0;
  panelSizes.clear();
  unmounts.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it('shows and hides the chrome without remounting the workspace', () => {
  render(shell({}));
  render(shell({ titleBar: createElement('header') }));
  render(shell({ titleBar: null, sidebar: createElement('nav') }));
  render(shell({ titleBar: createElement('header'), sidebar: createElement('aside') }));
  expect(mounts).toEqual(['workspace']);
  expect(unmounts).toEqual([]);
  expect(host.querySelectorAll('[data-probe="workspace"]')).toHaveLength(1);
});

it('moves the title bar and the tabs between the layouts without remounting the workspace', () => {
  const strip = createElement('div', { 'data-tabs': '' });
  render(shell({ titleBar: createElement('header', null, strip) }));
  render(
    shell({ titleBar: createElement('header'), placement: 'overlay', tabsColumn: createElement('aside', null, strip) }),
  );
  render(shell({ titleBar: createElement('header', null, strip) }));
  render(
    shell({ titleBar: createElement('header'), placement: 'overlay', tabsColumn: createElement('aside', null, strip) }),
  );
  expect(mounts).toEqual(['workspace']);
  expect(unmounts).toEqual([]);
});

it('keeps only the overlay title bar in focus mode and brings the chrome back without remounting the workspace', () => {
  for (const placement of ['inline', 'overlay'] as const) {
    const chrome = {
      placement,
      titleBar: createElement('header', { 'data-chrome': 'bar' }),
      sidebar: createElement('aside', { 'data-chrome': 'sidebar' }),
      tabsColumn: placement === 'overlay' ? createElement('nav', { 'data-chrome': 'tabs' }) : null,
    };
    render(shell(chrome));
    expect(host.querySelectorAll('[data-chrome]').length).toBeGreaterThan(1);
    // The app floats the bar over the window in focus mode, whatever the tab orientation.
    render(shell({ ...chrome, placement: 'overlay', focusMode: true }));
    expect([...host.querySelectorAll('[data-chrome]')].map((el) => el.getAttribute('data-chrome'))).toEqual(['bar']);
    expect(host.querySelectorAll('[role="separator"]')).toHaveLength(0);
    render(shell(chrome));
    expect(host.querySelector('[data-chrome="sidebar"]')).not.toBeNull();
    expect(host.querySelector('[data-chrome="bar"]')).not.toBeNull();
  }
  expect(mounts).toEqual(['workspace']);
  expect(unmounts).toEqual([]);
});

it('keeps each side panel on the size it mounted with, and takes the new one when it mounts again', () => {
  const column = createElement('nav');
  render(shell({ sidebar: createElement('aside'), sidebarWidth: 220, tabsColumn: column, tabsColumnWidth: 146 }));
  // The sidebar collapsing (0) and the column being dragged must not reach their own panels: the library
  // re-registers a panel and lays its group out again whenever its defaultSize changes.
  render(shell({ sidebar: createElement('aside'), sidebarWidth: 0, tabsColumn: column, tabsColumnWidth: 300 }));
  expect(panelSizes.get('sidebar')).toEqual(['220px']);
  expect(panelSizes.get('tabs-column')).toEqual(['146px']);

  // Focus mode unmounts both; they come back at the sizes they have then.
  render(shell({ focusMode: true, sidebar: createElement('aside'), sidebarWidth: 0, tabsColumn: column }));
  render(shell({ sidebar: createElement('aside'), sidebarWidth: 0, tabsColumn: column, tabsColumnWidth: 300 }));
  expect(panelSizes.get('sidebar')).toEqual(['220px', '0px']);
  expect(panelSizes.get('tabs-column')).toEqual(['146px', '300px']);
});

it('swaps the side panels for the compact rail and back without remounting the workspace (E27-01)', () => {
  for (const placement of ['inline', 'overlay'] as const) {
    const chrome = {
      placement,
      titleBar: createElement('header', { 'data-chrome': 'bar' }),
      sidebar: createElement('aside', { 'data-chrome': 'sidebar' }),
      tabsColumn: placement === 'overlay' ? createElement('nav', { 'data-chrome': 'tabs' }) : null,
    };
    render(shell(chrome));
    expect(host.querySelector('[data-chrome="rail"]')).toBeNull();
    render(shell({ ...chrome, compact: true }));
    expect(host.querySelector('[data-chrome="rail"]')).not.toBeNull();
    expect(host.querySelector('[data-chrome="tabs"]')).toBeNull();
    // The title bar stays: the rail only replaces the side panels.
    expect(host.querySelector('[data-chrome="bar"]')).not.toBeNull();
    // Focus mode hides the rail too.
    render(shell({ ...chrome, compact: true, focusMode: true }));
    expect(host.querySelector('[data-chrome="rail"]')).toBeNull();
    expect(host.querySelector('[data-rail-edge]')).toBeNull();
    render(shell(chrome));
    expect(host.querySelector('[data-chrome="rail"]')).toBeNull();
    expect(host.querySelector('[data-chrome="sidebar"]')).not.toBeNull();
  }
  expect(mounts).toEqual(['workspace']);
  expect(unmounts).toEqual([]);
});

it('keeps the rail out of the panel group, at its fixed width, and hides it without unmounting it (E27-05)', () => {
  render(shell({ compact: true, sidebar: createElement('aside') }));
  const railBox = () => host.querySelector<HTMLElement>('[data-chrome-rail]');
  expect(railBox()?.style.width).toBe('32px');
  expect(railBox()?.closest('[data-panel]')).toBeNull();
  expect(host.querySelector('[data-rail-edge]')?.getAttribute('role')).toBeNull();
  render(shell({ compact: true, sidebar: createElement('aside'), sidebarOpen: false }));
  expect(railBox()?.classList.contains('hidden')).toBe(true);
  expect(host.querySelector('[data-chrome="rail"]')).not.toBeNull();
  expect(mounts).toEqual(['workspace']);
});

it('hides the rail from its edge, and shows it from the window edge, in one jump past 24 px (E27-05)', () => {
  const hidden = vi.fn();
  const viewsOpen = vi.fn();
  const edge = () => host.querySelector('[data-rail-edge]') as HTMLElement;
  const pointer = (type: string, clientX: number) =>
    act(() => {
      edge().dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX, pointerId: 1 }));
    });
  const shown = (sidebarOpen: boolean) =>
    render(shell({ compact: true, sidebarOpen, onSidebarHiddenChange: hidden, onCompactPanelChange: viewsOpen }));

  shown(true);
  pointer('pointerdown', 32);
  pointer('pointermove', 9);
  expect(hidden).not.toHaveBeenCalled();
  pointer('pointermove', 7);
  expect(hidden).toHaveBeenLastCalledWith(true);
  // Back over the threshold before the release: the rail comes back, and the views beside it stay.
  pointer('pointermove', 20);
  expect(hidden).toHaveBeenLastCalledWith(false);
  pointer('pointerup', 20);
  expect(viewsOpen).not.toHaveBeenCalled();
  // Released hidden, the rail closes the views.
  pointer('pointerdown', 32);
  pointer('pointermove', 0);
  pointer('pointerup', 0);
  expect(hidden).toHaveBeenLastCalledWith(true);
  expect(viewsOpen).toHaveBeenCalledWith(false);

  shown(false);
  pointer('pointerdown', 0);
  pointer('pointermove', 25);
  pointer('pointerup', 25);
  expect(hidden).toHaveBeenLastCalledWith(false);
});

it('has the sidebar panel only while the views are open beside the rail (E27-04)', () => {
  const sidebar = createElement('aside', { 'data-chrome': 'sidebar' });
  render(shell({ compact: true, sidebar }));
  expect(host.querySelector('[data-chrome="sidebar"]')).toBeNull();
  expect(host.querySelectorAll('[role="separator"]')).toHaveLength(0);
  render(shell({ compact: true, sidebar, views: true }));
  expect(host.querySelector('[data-chrome="sidebar"]')).not.toBeNull();
  expect(host.querySelectorAll('[role="separator"]')).toHaveLength(1);
  // They open at the sidebar's stored width.
  expect(panelSizes.get('sidebar')).toEqual(['260px']);
  // The rail leads them.
  const order = [...host.querySelectorAll('[data-chrome]')].map((el) => el.getAttribute('data-chrome'));
  expect(order.indexOf('rail')).toBeLessThan(order.indexOf('sidebar'));
  render(shell({ compact: true, sidebar }));
  expect(host.querySelector('[data-chrome="sidebar"]')).toBeNull();
  expect(mounts).toEqual(['workspace']);
  expect(unmounts).toEqual([]);
});

it('lets the views headers drag the window beside the inline title bar, out of full screen', () => {
  const sidebar = createElement(SidebarViewHeader, { title: 'Spaces' });
  const drag = () => host.querySelector('[data-tauri-drag-region]')?.getAttribute('data-tauri-drag-region') ?? null;
  render(shell({ sidebar, placement: 'inline' }));
  expect(drag()).toBe('deep');
  render(shell({ sidebar, placement: 'inline', fullScreen: true }));
  expect(drag()).toBeNull();
  render(shell({ sidebar, placement: 'overlay' }));
  expect(drag()).toBeNull();
  // The views beside the rail, too.
  render(shell({ sidebar, placement: 'inline', compact: true, views: true }));
  expect(drag()).toBe('deep');
});
