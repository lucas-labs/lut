// @vitest-environment happy-dom
import { act, createElement, createRef, type ReactNode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { AppShell } from './AppShell';

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

function shell(props: { header?: ReactNode; statusBar?: ReactNode; sidebar?: ReactNode; tabsColumn?: ReactNode }) {
  return createElement(AppShell, {
    header: props.header ?? null,
    tabsColumn: props.tabsColumn ?? null,
    tabsColumnRef: createRef<PanelImperativeHandle>(),
    tabsColumnInitialWidth: 200,
    onTabsColumnLayout: () => {},
    statusBar: props.statusBar ?? null,
    sidebar: props.sidebar ?? null,
    sidebarRef,
    sidebarInitialWidth: 0,
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
  render(shell({ header: createElement('header'), statusBar: createElement('footer') }));
  render(shell({ header: null, statusBar: null, sidebar: createElement('nav') }));
  render(shell({ header: createElement('header'), sidebar: createElement('aside') }));
  expect(mounts).toEqual(['workspace']);
  expect(unmounts).toEqual([]);
  expect(host.querySelectorAll('[data-probe="workspace"]')).toHaveLength(1);
});

it('switches the tabs between the title bar and a vertical column without remounting the workspace', () => {
  const strip = createElement('div', { 'data-tabs': '' });
  render(shell({ header: createElement('header', null, strip) }));
  render(shell({ header: createElement('header'), tabsColumn: createElement('aside', null, strip) }));
  render(shell({ header: createElement('header', null, strip) }));
  render(shell({ header: createElement('header'), tabsColumn: createElement('aside', null, strip) }));
  expect(mounts).toEqual(['workspace']);
  expect(unmounts).toEqual([]);
});
