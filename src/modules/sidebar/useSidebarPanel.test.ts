// @vitest-environment happy-dom
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  shouldPersistSidebarWidth,
  sidebarStartsCollapsed,
  useSidebarPanel,
} from './useSidebarPanel';

describe('shouldPersistSidebarWidth', () => {
  it('only persists a positive width from direct user interaction', () => {
    expect(shouldPersistSidebarWidth(320, true)).toBe(true);
    expect(shouldPersistSidebarWidth(320, false)).toBe(false);
    expect(shouldPersistSidebarWidth(0, true)).toBe(false);
  });
});

describe('sidebarStartsCollapsed', () => {
  it('starts collapsed unless the user left the sidebar open', () => {
    expect(sidebarStartsCollapsed(null)).toBe(true);
    expect(sidebarStartsCollapsed('1')).toBe(true);
    expect(sidebarStartsCollapsed('0')).toBe(false);
  });
});

type Controls = ReturnType<typeof useSidebarPanel>;

describe('useSidebarPanel in compact mode (E27-04)', () => {
  let host: HTMLDivElement;
  let root: Root;
  let controls: Controls;

  function Harness({ compact }: { compact: boolean }) {
    controls = useSidebarPanel(createRef(), compact);
    return null;
  }

  const render = (compact = true) => act(() => root.render(createElement(Harness, { compact })));
  const run = (f: () => void) => act(f);

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // The rail was left shown.
    window.localStorage.clear();
    window.localStorage.setItem('lut.sidebar.collapsed', '0');
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    render();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('hides and shows the rail, not the views, from the sidebar command, and stores it', () => {
    run(() => controls.toggleSidebar());
    expect(controls.sidebarHidden).toBe(true);
    expect(window.localStorage.getItem('lut.sidebar.collapsed')).toBe('1');
    run(() => controls.toggleSidebar());
    expect(controls.sidebarHidden).toBe(false);
    expect(controls.compactPanelOpen).toBe(false);
    expect(window.localStorage.getItem('lut.sidebar.collapsed')).toBe('0');
  });

  it('opens a view beside the rail, switches to the other and closes on its own', () => {
    run(() => controls.cycleSidebarView('source-control'));
    expect(controls.compactPanelOpen).toBe(true);
    expect(controls.sidebarView).toBe('source-control');
    run(() => controls.cycleSidebarView('explorer'));
    expect(controls.compactPanelOpen).toBe(true);
    expect(controls.sidebarView).toBe('explorer');
    run(() => controls.cycleSidebarView('explorer'));
    expect(controls.compactPanelOpen).toBe(false);
  });

  it('shows the rail with a view asked for while it is hidden', () => {
    run(() => controls.persistSidebarHidden(true));
    run(() => controls.openSidebarView('explorer'));
    expect(controls.sidebarHidden).toBe(false);
    expect(controls.compactPanelOpen).toBe(true);
  });

  it('shows the rail and closes the views when the spaces are asked for', () => {
    run(() => controls.cycleSidebarView('explorer'));
    run(() => controls.openSidebarView('spaces'));
    expect(controls.sidebarHidden).toBe(false);
    expect(controls.compactPanelOpen).toBe(false);
    expect(controls.sidebarView).toBe('explorer');
  });

  it('hides the views with the rail, and closes them when the rail is hidden by its command', () => {
    run(() => controls.cycleSidebarView('explorer'));
    // A drag on the rail's edge hides it, and may bring it back before its release: the views come back with it.
    run(() => controls.persistSidebarHidden(true));
    expect(controls.compactPanelOpen).toBe(false);
    expect(controls.sidebarCollapsed).toBe(true);
    run(() => controls.persistSidebarHidden(false));
    expect(controls.compactPanelOpen).toBe(true);
    run(() => controls.toggleSidebar());
    run(() => controls.toggleSidebar());
    expect(controls.compactPanelOpen).toBe(false);
  });

  it('keeps the views off screen until they open, and starts them closed each time compact mode starts', () => {
    expect(controls.sidebarCollapsed).toBe(true);
    run(() => controls.cycleSidebarView('explorer'));
    expect(controls.sidebarCollapsed).toBe(false);
    // Full mode: the views are off screen only when the sidebar is hidden.
    render(false);
    expect(controls.sidebarCollapsed).toBe(false);
    render(true);
    expect(controls.sidebarCollapsed).toBe(true);
  });
});
