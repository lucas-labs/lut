// @vitest-environment happy-dom
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
    if (seen.at(-1) !== props.defaultSize) panelSizes.set(props.id ?? '', [...seen, props.defaultSize]);
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
  titleBar?: ReactNode;
  placement?: 'inline' | 'overlay';
  sidebar?: ReactNode;
  sidebarWidth?: number;
  tabsColumn?: ReactNode;
  tabsColumnWidth?: number;
}) {
  return createElement(AppShell, {
    focusMode: props.focusMode ?? false,
    titleBar: props.titleBar ?? null,
    titleBarPlacement: props.placement ?? 'inline',
    tabsColumn: props.tabsColumn ?? null,
    sidebarOpen: true,
    tabsColumnOpen: true,
    tabsColumnRef: createRef<PanelImperativeHandle>(),
    tabsColumnInitialWidth: props.tabsColumnWidth ?? 200,
    onTabsColumnLayout: () => {},
    sidebar: props.sidebar ?? null,
    sidebarRef,
    sidebarInitialWidth: props.sidebarWidth ?? 0,
    onSidebarLayout: () => {},
    onSidebarCollapsedChange: () => {},
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

it('hides every piece of chrome in focus mode and brings it back without remounting the workspace', () => {
  for (const placement of ['inline', 'overlay'] as const) {
    const chrome = {
      placement,
      titleBar: createElement('header', { 'data-chrome': 'bar' }),
      sidebar: createElement('aside', { 'data-chrome': 'sidebar' }),
      tabsColumn: placement === 'overlay' ? createElement('nav', { 'data-chrome': 'tabs' }) : null,
    };
    render(shell(chrome));
    expect(host.querySelectorAll('[data-chrome]').length).toBeGreaterThan(1);
    render(shell({ ...chrome, focusMode: true }));
    expect(host.querySelectorAll('[data-chrome]')).toHaveLength(0);
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
