// @vitest-environment happy-dom
import type { Tab } from '@/modules/tabs';
import { disposeGhosttySession } from '@/modules/terminal/ghostty/useGhosttyTerminalSession';
import { type PaneNode, splitLeaf } from '@/modules/terminal/lib/panes';
import * as themeModule from '@/modules/theme';
import { act, type Context, createElement, createRef, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../AppShell';
import { WorkspaceSurface } from './WorkspaceSurface';

// The real session hook (useGhosttyTerminalSession) runs here; only what needs a GPU, the WASM core or the native
// side is replaced: the Ghostty core and its model, the renderer surface, the input controller, font loading,
// measuring and theme colours, and the PTY bridge. PTY opens and closes are counted where the hook calls the bridge, so a session the
// hook restarts on its own (an effect that disposes on a visibility or order change) shows up as an extra open or
// close. WorkspaceSurface.lifecycle.test.tsx covers the same moves with a fake hook and counts React mounts.
const pty = vi.hoisted(() => ({ opened: [] as number[], closed: [] as number[] }));

/** An object with the given members; any other member is a no-op function (never a thenable). */
const stub = vi.hoisted(
  () =>
    <T extends object>(members: T): T =>
      new Proxy(members, {
        get: (target, key) => (key in target ? Reflect.get(target, key) : key === 'then' ? undefined : () => undefined),
      }),
);

vi.mock('@/modules/terminal/lib/pty-bridge', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openPty: async (
    _cols: number,
    _rows: number,
    _handlers: unknown,
    _cwd?: string,
    _shell?: string,
    leafId?: number,
  ) => {
    pty.opened.push(leafId ?? -1);
    return {
      id: leafId ?? -1,
      write: async () => {},
      resize: async () => {},
      setColors: async () => {},
      close: async () => {
        pty.closed.push(leafId ?? -1);
      },
    };
  },
}));
vi.mock('@tauri-apps/api/core', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  invoke: async () => null,
}));
vi.mock('@/lib/fonts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ensureMonoFontsLoaded: async () => {},
}));
vi.mock('@/modules/terminal/ghostty/gpu/terminalVisuals', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  measureTerminalFont: async () => ({ cellWidth: 8, cellHeight: 16, baseline: 12 }),
  // The real one converts CSS colours through a canvas, which happy-dom lacks.
  readTerminalGpuTheme: () => ({
    background: [0, 0, 0],
    foreground: [255, 255, 255],
    cursor: [255, 255, 255],
    cursorText: [0, 0, 0],
    selection: { color: [80, 80, 80], alpha: 0.5 },
    palette: Array.from({ length: 16 }, () => [128, 128, 128]),
  }),
}));
vi.mock('@/modules/terminal/ghostty/GhosttyCoreRuntime', () => ({
  getGhosttyCoreRuntime: () => ({
    preload: async () => {},
    createModel: async () => stub({ cols: 80, rows: 24 }),
  }),
}));
// The hook loads the WebGL renderer through loadSessionRenderer (a dynamic import); hand it a fake surface class.
vi.mock('@/modules/terminal/ghostty/loadSessionRenderer', () => {
  class FakeWebGlSurface {
    constructor() {
      return stub({
        backend: 'ghostty-webgl',
        eventTarget: () => document.createElement('div'),
        inputElement: () => document.createElement('textarea'),
        cellSize: () => ({ width: 8, height: 16 }),
        gridShiftY: () => 0,
        getSelection: () => null,
        searchController: () => stub({}),
      });
    }
  }
  return {
    loadSessionRenderer: async (
      _session: unknown,
      _generation: number,
      _load: unknown,
      apply: (renderer: { WebGlTerminalSurface: typeof FakeWebGlSurface }) => unknown,
    ) => apply({ WebGlTerminalSurface: FakeWebGlSurface }),
  };
});
vi.mock('@/modules/terminal/ghostty/input/GhosttyInputController', () => ({
  GhosttyInputController: class {
    constructor() {
      return stub({});
    }
  },
}));
// Theme changes reach the panes through context, as with the real ThemeProvider.
vi.mock('@/modules/theme', async (importOriginal) => {
  const { createContext, useContext } = await import('react');
  const actual = await importOriginal<typeof import('@/modules/theme')>();
  const ThemeContext = createContext({ resolvedMode: 'dark', activeTheme: actual.listBuiltinThemes()[0] });
  return { ...actual, ThemeContext, useTheme: () => useContext(ThemeContext) };
});
// The other surfaces render nothing without their own tabs; stubbing them keeps their code out of the test.
vi.mock('@/modules/editor', () => ({ EditorStack: () => null, GitDiffStack: () => null }));
vi.mock('@/modules/git-history', () => ({ GitHistoryStack: () => null }));
vi.mock('@/modules/markdown', () => ({ MarkdownStack: () => null }));
vi.mock('@/modules/preview', () => ({ PreviewStack: () => null }));

type ThemeValue = { resolvedMode: string; activeTheme: unknown };
const { ThemeContext } = themeModule as unknown as { ThemeContext: Context<ThemeValue> };
const [firstTheme, secondTheme] = themeModule.listBuiltinThemes();

const noop = () => {};
let root: Root;
let host: HTMLElement;
let nextId = 1;

/** Each test uses fresh leaf ids: sessions live in a module registry that outlives the React tree. */
function term(paneTree?: PaneNode): Extract<Tab, { kind: 'terminal' }> {
  const id = nextId++;
  const tree = paneTree ?? { kind: 'leaf', id: id * 100 };
  return {
    id,
    kind: 'terminal',
    spaceId: 'default',
    title: 'shell',
    paneTree: tree,
    activeLeafId: tree.kind === 'leaf' ? tree.id : id * 100,
  };
}

const leaves = (tabs: Tab[]) =>
  tabs.flatMap((tab) => {
    if (tab.kind !== 'terminal') return [];
    const walk = (node: PaneNode): number[] => (node.kind === 'leaf' ? [node.id] : node.children.flatMap(walk));
    return walk(tab.paneTree);
  });

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

type ShellOptions = { vertical?: boolean; sidebar?: ReactNode; mode?: string; theme?: unknown };

/** The window around the workspace, inside the theme. */
function shell(
  tabs: Tab[],
  activeId: number,
  { vertical = false, sidebar = null, mode = 'dark', theme = firstTheme }: ShellOptions = {},
) {
  const strip = createElement('div', { 'data-tabs': '' });
  return createElement(
    ThemeContext.Provider,
    { value: { resolvedMode: mode, activeTheme: theme } },
    createElement(AppShell, {
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
      workspace: surface(tabs, activeId),
    }),
  );
}

/** Renders, then lets the sessions' async start (fonts, core, renderer, PTY) and theme frames run. */
async function render(node: ReactNode) {
  await act(async () => {
    root.render(node);
  });
  await settle();
}

async function settle() {
  for (let i = 0; i < 20; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (!('fonts' in document)) {
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
  }
  pty.opened = [];
  pty.closed = [];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  for (const leaf of new Set(pty.opened)) disposeGhosttySession(leaf);
});

describe('the real session hook keeps every PTY open', () => {
  it('opens one PTY per pane at start', async () => {
    const tabs = [term(), term(), term()];
    await render(shell(tabs, tabs[0].id));
    expect([...pty.opened].sort((a, b) => a - b)).toEqual(leaves(tabs));
    expect(pty.closed).toEqual([]);
  });

  it('switching and reordering tabs opens and closes no PTY', async () => {
    const [a, b, c] = [term(), term(), term()];
    await render(shell([a, b, c], a.id));
    const opened = [...pty.opened];
    expect(opened).toHaveLength(3);
    await render(shell([a, b, c], b.id));
    await render(shell([c, a, b], c.id));
    await render(shell([b, c, a], a.id));
    expect(pty.opened).toEqual(opened);
    expect(pty.closed).toEqual([]);
  });

  it('splitting a pane opens only the new pane', async () => {
    const a = term();
    const b = term();
    await render(shell([a, b], a.id));
    const opened = [...pty.opened];
    expect(opened).toHaveLength(2);
    const leaf = a.activeLeafId;
    const split = { ...a, paneTree: splitLeaf({ kind: 'leaf', id: leaf }, leaf, leaf + 1, leaf + 2, 'row') };
    await render(shell([split, b], a.id));
    expect(pty.opened).toEqual([...opened, leaf + 2]);
    expect(pty.closed).toEqual([]);
  });

  it('switching the tab orientation and the sidebar views opens and closes no PTY', async () => {
    const tabs = [term(), term()];
    const view = (name: string) => createElement('nav', { key: name }, name);
    await render(shell(tabs, tabs[0].id));
    const opened = [...pty.opened];
    expect(opened).toHaveLength(2);
    await render(shell(tabs, tabs[0].id, { vertical: true }));
    await render(shell(tabs, tabs[0].id, { vertical: true, sidebar: view('spaces') }));
    await render(shell(tabs, tabs[1].id, { sidebar: view('explorer') }));
    await render(shell(tabs, tabs[1].id));
    expect(pty.opened).toEqual(opened);
    expect(pty.closed).toEqual([]);
  });

  it('switching the theme opens and closes no PTY', async () => {
    const tabs = [term(), term()];
    await render(shell(tabs, tabs[0].id));
    const opened = [...pty.opened];
    expect(opened).toHaveLength(2);
    await render(shell(tabs, tabs[0].id, { mode: 'light' }));
    await render(shell(tabs, tabs[1].id, { mode: 'dark', theme: secondTheme }));
    expect(pty.opened).toEqual(opened);
    expect(pty.closed).toEqual([]);
  });
});
