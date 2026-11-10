// @vitest-environment happy-dom
import type { Tab } from '@/modules/tabs';
import { type PaneLifecycleEvent, setPaneLifecycleListener } from '@/modules/terminal/lib/paneLifecycle';
import { type PaneNode, removeLeaf, splitLeaf } from '@/modules/terminal/lib/panes';
import { act, createElement, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../AppShell';
import { WorkspaceSurface } from './WorkspaceSurface';

// The PTY bridge is mocked at the session hook: the real hook needs the Ghostty WASM renderer. The session registry
// outlives React: a pane that mounts reuses the leaf's session, and only an explicit dispose closes its PTY. The fake
// keeps that contract so the tests can count PTY opens (pty_open) and closes (pty_close) per leaf.
const fake = vi.hoisted(() => ({
  opened: [] as number[],
  closed: [] as number[],
  live: new Set<number>(),
  output: new Map<number, number>(),
  mounted: new Set<number>(),
}));
vi.mock('@/modules/terminal/ghostty/useGhosttyTerminalSession', async () => {
  const { useEffect } = await import('react');
  return {
    useGhosttyTerminalSession: ({ leafId }: { leafId: number }) => {
      if (!fake.live.has(leafId)) {
        fake.live.add(leafId);
        fake.opened.push(leafId);
      }
      useEffect(() => {
        fake.mounted.add(leafId);
        return () => {
          fake.mounted.delete(leafId);
        };
      }, [leafId]);
      return {
        model: null,
        error: null,
        write: () => {},
        writeAtPrompt: async () => false,
        focus: () => {},
        getBuffer: () => null,
        getSelection: () => null,
        applyTheme: () => {},
        retry: () => {},
      };
    },
    disposeGhosttySession: (leafId: number) => {
      fake.closed.push(leafId);
      fake.live.delete(leafId);
      return true;
    },
  };
});
vi.mock('@/modules/theme', () => ({ useTheme: () => ({ resolvedMode: 'dark', activeTheme: null }) }));
// The other surfaces render nothing without their own tabs; stubbing them keeps their code out of the test.
vi.mock('@/modules/editor', () => ({ EditorStack: () => null, GitDiffStack: () => null }));
vi.mock('@/modules/git-history', () => ({ GitHistoryStack: () => null }));
vi.mock('@/modules/markdown', () => ({ MarkdownStack: () => null }));
vi.mock('@/modules/preview', () => ({ PreviewStack: () => null }));

/** PTY output reaches every session that is still mounted, visible or not. */
function emitOutput() {
  for (const leafId of fake.mounted) fake.output.set(leafId, (fake.output.get(leafId) ?? 0) + 1);
}

function term(id: number, paneTree: PaneNode = { kind: 'leaf', id: id * 10 }): Tab {
  return {
    id,
    kind: 'terminal',
    spaceId: 'default',
    title: 'shell',
    paneTree,
    activeLeafId: paneTree.kind === 'leaf' ? paneTree.id : id * 10,
  };
}

const noop = () => {};
let root: Root;
let host: HTMLElement;
let events: Array<[PaneLifecycleEvent, number]>;

function render(node: ReactNode) {
  act(() => root.render(node));
}

function surface(tabs: Tab[], activeId: number) {
  return createElement(WorkspaceSurface, {
    tabs,
    activeId,
    activeTab: tabs.find((tab) => tab.id === activeId),
    registerTerminalHandle: noop,
    onSearchReady: noop,
    onCwd: noop,
    onExit: noop,
    onFocusLeaf: noop,
    registerEditorHandle: noop,
    onEditorDirtyChange: noop,
    onEditorCloseTab: noop,
    registerPreviewHandle: noop,
    onPreviewUrlChange: noop,
    onOpenCommitFile: noop,
    onGitHistorySearchHandle: noop,
    onSetMarkdownView: noop,
  });
}

/** The window around the workspace: tabs in the title bar or in the vertical column, and a sidebar view or none. */
function shell(tabs: Tab[], { vertical = false, sidebar = null }: { vertical?: boolean; sidebar?: ReactNode } = {}) {
  const strip = createElement('div', { 'data-tabs': '' });
  return createElement(AppShell, {
    header: createElement('header', null, vertical ? null : strip),
    tabsColumn: vertical ? createElement('aside', null, strip) : null,
    tabsColumnRef: createRef<PanelImperativeHandle>(),
    tabsColumnInitialWidth: 200,
    onTabsColumnLayout: noop,
    statusBar: null,
    sidebar,
    sidebarRef: createRef<PanelImperativeHandle>(),
    sidebarInitialWidth: 0,
    onSidebarLayout: noop,
    onSidebarCollapsedChange: noop,
    workspace: surface(tabs, 1),
  });
}

const mounts = (leafId: number) => events.filter(([e, id]) => e === 'mount' && id === leafId).length;
const unmounts = (leafId: number) => events.filter(([e, id]) => e === 'unmount' && id === leafId).length;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  events = [];
  fake.opened = [];
  fake.closed = [];
  fake.live.clear();
  fake.output.clear();
  setPaneLifecycleListener((event, leafId) => events.push([event, leafId]));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  setPaneLifecycleListener(null);
});

describe('WorkspaceSurface keeps terminals mounted', () => {
  it('switching tabs keeps every pane mounted and opens no new PTY', () => {
    const tabs = [term(1), term(2), term(3)];
    render(surface(tabs, 1));
    render(surface(tabs, 2));
    render(surface(tabs, 3));
    render(surface(tabs, 1));
    for (const leaf of [10, 20, 30]) {
      expect(mounts(leaf)).toBe(1);
      expect(unmounts(leaf)).toBe(0);
    }
    expect(fake.opened).toEqual([10, 20, 30]);
    expect(fake.closed).toEqual([]);
  });

  it('splitting a pane keeps the other panes mounted and the split pane keeps its PTY', () => {
    const other = term(2);
    render(surface([term(1), other], 1));
    const split = splitLeaf({ kind: 'leaf', id: 10 }, 10, 100, 11, 'row');
    render(surface([term(1, split), other], 1));
    expect(mounts(20)).toBe(1);
    expect(unmounts(20)).toBe(0);
    expect(fake.opened).toEqual([10, 20, 11]);
    expect(fake.closed).toEqual([]);
  });

  it('closing a sibling pane keeps the remaining panes mounted', () => {
    const three: PaneNode = {
      kind: 'split',
      id: 100,
      dir: 'row',
      children: [
        { kind: 'leaf', id: 10 },
        { kind: 'leaf', id: 11 },
        { kind: 'leaf', id: 12 },
      ],
    };
    render(surface([term(1, three), term(2)], 1));
    const remaining = removeLeaf(three, 12);
    expect(remaining).not.toBeNull();
    render(surface([term(1, remaining as PaneNode), term(2)], 1));
    for (const leaf of [10, 11, 20]) {
      expect(mounts(leaf)).toBe(1);
      expect(unmounts(leaf)).toBe(0);
    }
    expect(unmounts(12)).toBe(1);
    expect(fake.closed).toEqual([]);
  });

  it('hidden tabs stay mounted and keep receiving output', () => {
    const tabs = [term(1), term(2)];
    render(surface(tabs, 1));
    render(surface(tabs, 2));
    emitOutput();
    emitOutput();
    expect(fake.output.get(10)).toBe(2);
    const hidden = host.querySelector<HTMLElement>('[data-terminal-tab="1"]');
    expect(hidden?.style.visibility).toBe('hidden');
    render(surface(tabs, 1));
    expect(mounts(10)).toBe(1);
    expect(unmounts(10)).toBe(0);
  });

  it('detects a surface that is re-parented or rendered conditionally', () => {
    const tabs = [term(1)];
    const wrapped = (inBox: boolean) =>
      inBox ? createElement('section', null, surface(tabs, 1)) : createElement('div', null, surface(tabs, 1));
    render(wrapped(false));
    render(wrapped(true));
    expect(unmounts(10)).toBe(1);
    expect(mounts(10)).toBe(2);
    render(null);
    render(surface(tabs, 1));
    expect(mounts(10)).toBe(3);
  });

  it('switching the tab orientation keeps every pane mounted and opens or closes no PTY (E07-05)', () => {
    const tabs = [term(1), term(2, splitLeaf({ kind: 'leaf', id: 20 }, 20, 200, 21, 'col'))];
    render(shell(tabs));
    render(shell(tabs, { vertical: true }));
    render(shell(tabs));
    render(shell(tabs, { vertical: true }));
    for (const leaf of [10, 20, 21]) {
      expect(mounts(leaf)).toBe(1);
      expect(unmounts(leaf)).toBe(0);
    }
    expect(fake.opened).toEqual([10, 20, 21]);
    expect(fake.closed).toEqual([]);
  });

  it('switching sidebar views and hiding the sidebar keeps every pane mounted and opens or closes no PTY (E07-06)', () => {
    const tabs = [term(1), term(2)];
    const view = (name: string) => createElement('nav', { key: name }, name);
    render(shell(tabs, { sidebar: view('spaces') }));
    render(shell(tabs, { sidebar: view('source-control') }));
    render(shell(tabs, { sidebar: view('explorer') }));
    render(shell(tabs));
    render(shell(tabs, { sidebar: view('spaces'), vertical: true }));
    for (const leaf of [10, 20]) {
      expect(mounts(leaf)).toBe(1);
      expect(unmounts(leaf)).toBe(0);
    }
    expect(fake.opened).toEqual([10, 20]);
    expect(fake.closed).toEqual([]);
  });
});
