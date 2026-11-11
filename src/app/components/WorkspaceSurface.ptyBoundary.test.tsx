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
// side is replaced: the Ghostty core and its model, the renderer surfaces and the WebGPU runtime, the input
// controller, font loading, measuring and theme colours, and the PTY bridge. PTY opens and closes are counted where the
// hook calls the bridge, so a session the hook restarts on its own (an effect that disposes on a visibility or order
// change) shows up as an extra open or close. WorkspaceSurface.lifecycle.test.tsx covers the same moves with a fake
// hook and counts React mounts.
const pty = vi.hoisted(() => ({
  opened: [] as number[],
  closed: [] as number[],
  /** Each PTY's output handler, to emit shell output. */
  output: new Map<number, (bytes: Uint8Array) => unknown>(),
}));
/** What reached each terminal model (the Ghostty core), and how many WebGL surfaces were built. */
const terminal = vi.hoisted(() => ({ written: new Map<number, string>(), webGlSurfaces: 0 }));

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
    handlers: { onData: (bytes: Uint8Array) => unknown },
    _cwd?: string,
    _shell?: string,
    leafId?: number,
  ) => {
    pty.opened.push(leafId ?? -1);
    pty.output.set(leafId ?? -1, handlers.onData);
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
    createModel: async ({ leafId }: { leafId: number }) =>
      stub({
        cols: 80,
        rows: 24,
        write: (bytes: Uint8Array) => {
          terminal.written.set(leafId, (terminal.written.get(leafId) ?? '') + new TextDecoder().decode(bytes));
        },
      }),
  }),
}));
// WebGPU is unavailable: a session that wants it must fall back to WebGL.
vi.mock('@/modules/terminal/ghostty/gpu/WebGpuTerminalRuntime', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getWebGpuTerminalRuntime: async () => {
    throw new Error('WebGPU adapter unavailable');
  },
}));
// The hook loads the WebGL renderer through loadSessionRenderer (a dynamic import); hand it a fake surface class.
vi.mock('@/modules/terminal/ghostty/loadSessionRenderer', () => {
  class FakeWebGlSurface {
    constructor() {
      terminal.webGlSurfaces += 1;
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
/** Every leaf a test rendered, disposed after it whether or not its PTY opened. */
const rendered = new Set<number>();

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
  for (const leaf of leaves(tabs)) rendered.add(leaf);
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
      sidebar,
      sidebarRef: createRef<PanelImperativeHandle>(),
      sidebarInitialWidth: 0,
      onSidebarLayout: noop,
      onSidebarCollapsedChange: noop,
      workspace: surface(tabs, activeId),
    }),
  );
}

async function tick() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

/** Renders, then gives effects, theme frames and any unwanted session restart time to show up. */
async function render(node: ReactNode) {
  await act(async () => {
    root.render(node);
  });
  for (let i = 0; i < 20; i++) await tick();
}

/** Waits until `count` PTYs have opened (the sessions start asynchronously: fonts, core, renderer, then PTY). */
async function waitForOpens(count: number) {
  for (let i = 0; i < 400 && pty.opened.length < count; i++) await tick();
  expect(pty.opened).toHaveLength(count);
}

/** Shell output arriving on a leaf's PTY. */
function emit(leaf: number, text: string) {
  void pty.output.get(leaf)?.(new TextEncoder().encode(text));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (!('fonts' in document)) {
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
  }
  pty.opened = [];
  pty.closed = [];
  pty.output.clear();
  terminal.written.clear();
  terminal.webGlSurfaces = 0;
  rendered.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  for (const leaf of new Set([...rendered, ...pty.opened])) disposeGhosttySession(leaf);
});

describe('the real session hook keeps every PTY open', () => {
  it('opens one PTY per pane at start', async () => {
    const tabs = [term(), term(), term()];
    await render(shell(tabs, tabs[0].id));
    await waitForOpens(3);
    expect([...pty.opened].sort((a, b) => a - b)).toEqual(leaves(tabs));
    expect(pty.closed).toEqual([]);
  });

  it('switching and reordering tabs opens and closes no PTY', async () => {
    const [a, b, c] = [term(), term(), term()];
    await render(shell([a, b, c], a.id));
    await waitForOpens(3);
    const opened = [...pty.opened];
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
    await waitForOpens(2);
    const opened = [...pty.opened];
    const leaf = a.activeLeafId;
    const split = { ...a, paneTree: splitLeaf({ kind: 'leaf', id: leaf }, leaf, leaf + 1, leaf + 2, 'row') };
    await render(shell([split, b], a.id));
    await waitForOpens(3);
    expect(pty.opened).toEqual([...opened, leaf + 2]);
    expect(pty.closed).toEqual([]);
  });

  it('switching the tab orientation and the sidebar views opens and closes no PTY', async () => {
    const tabs = [term(), term()];
    const view = (name: string) => createElement('nav', { key: name }, name);
    await render(shell(tabs, tabs[0].id));
    await waitForOpens(2);
    const opened = [...pty.opened];
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
    await waitForOpens(2);
    const opened = [...pty.opened];
    await render(shell(tabs, tabs[0].id, { mode: 'light' }));
    await render(shell(tabs, tabs[1].id, { mode: 'dark', theme: secondTheme }));
    expect(pty.opened).toEqual(opened);
    expect(pty.closed).toEqual([]);
  });

  it('a hidden tab keeps receiving output and has all of it when shown again (E07-09)', async () => {
    const [a, b] = [term(), term()];
    await render(shell([a, b], a.id));
    await waitForOpens(2);
    const opened = [...pty.opened];
    await render(shell([a, b], b.id));
    emit(a.activeLeafId, 'built in 1.2s\r\n');
    emit(a.activeLeafId, 'watching for changes\r\n');
    await render(shell([a, b], a.id));
    expect(terminal.written.get(a.activeLeafId)).toBe('built in 1.2s\r\nwatching for changes\r\n');
    expect(pty.opened).toEqual(opened);
    expect(pty.closed).toEqual([]);
  });

  it('falls back to a working WebGL terminal when WebGPU is unavailable (E07-08)', async () => {
    Object.defineProperty(navigator, 'gpu', { configurable: true, value: {} });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const a = term();
      await render(shell([a], a.id));
      await waitForOpens(1);
      expect(terminal.webGlSurfaces).toBe(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('WebGPU initialization failed'),
        'WebGPU adapter unavailable',
      );
      emit(a.activeLeafId, 'ok\r\n');
      expect(terminal.written.get(a.activeLeafId)).toBe('ok\r\n');
    } finally {
      Reflect.deleteProperty(navigator, 'gpu');
      warn.mockRestore();
    }
  });
});
