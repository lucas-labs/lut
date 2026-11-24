// @vitest-environment happy-dom
import { usePreferencesStore } from '@/modules/settings/preferences';
import type { Tab } from '@/modules/tabs';
import { disposeGhosttySession } from '@/modules/terminal/ghostty/useGhosttyTerminalSession';
import { detachLeaf, insertLeaf, type PaneNode, splitLeaf } from '@/modules/terminal/lib/panes';
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
  /** The profile each open asked for, in order. */
  requested: [] as { leaf: number; profileId: string | undefined }[],
  /** Launch errors the next opens of a leaf fail with. */
  failures: new Map<number, { code: 'profileNotFound'; id: string; message: string }>(),
  /** Profiles the panes reported they opened with. */
  reported: [] as { leaf: number; profileId: string | undefined }[],
  /** Each PTY's exit handler, to end its shell. */
  exit: new Map<number, (code: number) => void>(),
  /** Panes the workspace was told to close after their process exited. */
  closedByExit: [] as { leaf: number; code: number }[],
}));
/** One custom profile per close behaviour. */
const CLOSE_BEHAVIORS: Record<string, string> = { asks: 'ask', closes: 'close', stays: 'keepOpen' };
/** What `useCloseBehavior` answers from: each profile's behaviour, or `null` before the first read. */
const listed = vi.hoisted(() => {
  let behaviors: Record<string, string> | null = null;
  const listeners = new Set<() => void>();
  return {
    get: (profileId: string | undefined) => (behaviors === null ? null : (behaviors[profileId ?? ''] ?? 'close')),
    set(next: Record<string, string> | null) {
      behaviors = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});
/** What `useProfileAppearance` answers from: each profile's appearance, or `null` before the first read. */
const appearances = vi.hoisted(() => {
  let byProfile: Record<string, object> | null = {};
  const listeners = new Set<() => void>();
  return {
    // A pane without a profile opens the default one.
    get: (profileId: string | undefined) => (byProfile === null ? null : byProfile[profileId ?? 'detected:pwsh']),
    set(next: Record<string, object> | null) {
      byProfile = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});
/** What reached each terminal model (the Ghostty core) and the renderer surfaces, and how many WebGL surfaces were built. */
const terminal = vi.hoisted(() => ({
  written: new Map<number, string>(),
  webGlSurfaces: 0,
  themes: 0,
  cursors: [] as string[],
  fonts: 0,
  /** The size of each font a surface was given after it started. */
  fontSizes: [] as number[],
  /** The font size each surface was built with. */
  startSizes: [] as number[],
  /** The cursor style each surface was built with. */
  startCursors: [] as string[],
  /** Whether the renderer has room for a font of this size. */
  fits: (_size: number) => true as boolean,
  /** Applying a font fails, as the WebGPU renderer does when no atlas can be had. */
  fontFails: false,
  /** Holds model creation, after the fonts were measured and before the surface exists. */
  modelGate: null as Promise<void> | null,
  /** Each padding a surface was given, in order. */
  paddings: [] as { top: number; right: number; bottom: number; left: number }[],
  /** Each model's alternate screen listener, to switch it as a full-screen program would. */
  alternateScreen: new Map<number, (active: boolean) => void>(),
  warnings: [] as string[],
}));
vi.mock('sonner', () => ({
  toast: Object.assign(() => {}, {
    warning: (title: string) => terminal.warnings.push(title),
  }),
}));

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
    handlers: { onData: (bytes: Uint8Array) => unknown; onExit?: (code: number) => void },
    { paneId: leafId, profileId }: { paneId?: number; profileId?: string } = {},
  ) => {
    pty.requested.push({ leaf: leafId ?? -1, profileId });
    const failure = pty.failures.get(leafId ?? -1);
    if (failure) {
      const { PtyLaunchError } = await import('@/modules/terminal/lib/launchError');
      throw new PtyLaunchError(failure);
    }
    pty.opened.push(leafId ?? -1);
    pty.output.set(leafId ?? -1, handlers.onData);
    if (handlers.onExit) pty.exit.set(leafId ?? -1, handlers.onExit);
    return {
      id: leafId ?? -1,
      // Native opens the default profile when none is asked for.
      profileId: profileId ?? 'detected:pwsh',
      write: async () => {},
      resize: async () => {},
      setColors: async () => {},
      close: async () => {
        pty.closed.push(leafId ?? -1);
      },
    };
  },
}));
vi.mock('@/modules/profiles', async (importOriginal) => {
  const { useSyncExternalStore } = await import('react');
  return {
    ...(await importOriginal<object>()),
    useCloseBehavior: (profileId: string | undefined) =>
      useSyncExternalStore(listed.subscribe, () => listed.get(profileId)),
    useProfileAppearance: (profileId: string | undefined) =>
      useSyncExternalStore(appearances.subscribe, () => appearances.get(profileId)),
  };
});
vi.mock('@/lib/fonts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ensureMonoFontsLoaded: async () => {},
}));
vi.mock('@/modules/terminal/ghostty/gpu/terminalVisuals', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  measureTerminalFont: async (font: object) => ({ font, cellWidth: 8, cellHeight: 16, baseline: 12 }),
  // The real one converts CSS colours through a canvas, which happy-dom lacks.
  terminalGpuTheme: () => ({
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
    createModel: async ({ leafId }: { leafId: number }) => {
      await terminal.modelGate;
      return stub({
        cols: 80,
        rows: 24,
        write: (bytes: Uint8Array) => {
          terminal.written.set(leafId, (terminal.written.get(leafId) ?? '') + new TextDecoder().decode(bytes));
        },
        subscribeAlternateScreen: (listener: (active: boolean) => void) => {
          terminal.alternateScreen.set(leafId, listener);
          return () => terminal.alternateScreen.delete(leafId);
        },
      });
    },
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
    constructor(options: { metrics: { font: { size: number } }; cursorStyle: string }) {
      terminal.webGlSurfaces += 1;
      terminal.startSizes.push(options.metrics.font.size);
      terminal.startCursors.push(options.cursorStyle);
      return stub({
        backend: 'ghostty-webgl',
        eventTarget: () => document.createElement('div'),
        inputElement: () => document.createElement('textarea'),
        cellSize: () => ({ width: 8, height: 16 }),
        gridShiftY: () => 0,
        getSelection: () => null,
        searchController: () => stub({}),
        fitsFont: (metrics: { font: { size: number } }) => terminal.fits(metrics.font.size),
        setPadding: (padding: { top: number; right: number; bottom: number; left: number }) => {
          terminal.paddings.push(padding);
        },
        setScrollbarGutter: () => {},
        setTheme: () => {
          terminal.themes += 1;
        },
        setCursorOptions: (_blink: boolean, style: string) => {
          terminal.cursors.push(style);
        },
        setFontMetrics: (metrics: { font: { size: number } }) => {
          if (terminal.fontFails) throw new Error('Terminal glyph atlas budget exhausted (8 active atlases)');
          terminal.fonts += 1;
          terminal.fontSizes.push(metrics.font.size);
        },
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

type ThemeValue = { resolvedMode: string; activeTheme: unknown; customThemes: unknown[] };
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
    onProfile: (leaf: number, profileId: string | undefined) => pty.reported.push({ leaf, profileId }),
    onTitle: () => {},
    onExit: (leaf: number, code: number) => pty.closedByExit.push({ leaf, code }),
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
    { value: { resolvedMode: mode, activeTheme: theme, customThemes: [] } },
    createElement(AppShell, {
      focusMode: false,
      compact: false,
      rail: null,
      titleBar: createElement('header', null, vertical ? null : strip),
      titleBarPlacement: vertical ? 'overlay' : 'inline',
      tabsColumn: vertical ? createElement('aside', null, strip) : null,
      sidebarOpen: true,
      tabsColumnOpen: true,
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
  pty.requested = [];
  pty.failures.clear();
  pty.reported = [];
  pty.exit.clear();
  pty.closedByExit = [];
  listed.set({ ...CLOSE_BEHAVIORS });
  appearances.set({});
  usePreferencesStore.setState({ settled: true });
  terminal.written.clear();
  terminal.webGlSurfaces = 0;
  terminal.themes = 0;
  terminal.cursors = [];
  terminal.fonts = 0;
  terminal.fontSizes = [];
  terminal.startSizes = [];
  terminal.startCursors = [];
  terminal.fits = () => true;
  terminal.fontFails = false;
  terminal.modelGate = null;
  terminal.warnings = [];
  terminal.paddings = [];
  terminal.alternateScreen.clear();
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

  it('moving a pane to another tab opens and closes no PTY and keeps its output (E08-07)', async () => {
    const a = term();
    const b = term();
    const leaf = a.activeLeafId;
    const moved = leaf + 2;
    const split = { ...a, paneTree: splitLeaf(a.paneTree, leaf, leaf + 1, moved, 'row') };
    await render(shell([split, b], a.id));
    await waitForOpens(3);
    emit(moved, 'top - 10:00:00 up 1 day\r\n');
    const opened = [...pty.opened];

    const detached = detachLeaf(split.paneTree, moved);
    if (!detached?.rest) throw new Error('Expected the pane to detach');
    const source = { ...split, paneTree: detached.rest, activeLeafId: leaf };
    const target = {
      ...b,
      paneTree: insertLeaf(b.paneTree, b.activeLeafId, b.activeLeafId + 1, detached.leaf, 'row'),
      activeLeafId: moved,
    };
    await render(shell([source, target], b.id));
    expect(pty.opened).toEqual(opened);
    expect(pty.closed).toEqual([]);
    expect(terminal.written.get(moved)).toContain('top - 10:00:00');
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

describe('each pane opens with its own profile (E14-14)', () => {
  /** Waits until `count` opens were asked for, failed ones included. */
  async function waitForRequests(count: number) {
    for (let i = 0; i < 400 && pty.requested.length < count; i++) await tick();
    expect(pty.requested).toHaveLength(count);
  }

  const button = (name: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement | undefined;

  it('opens a pane with its profile, and a new one with the default, which it then keeps', async () => {
    const ubuntu = term({ kind: 'leaf', id: nextId * 100, profileId: 'detected:wsl:Ubuntu' });
    const fresh = term();
    await render(shell([ubuntu, fresh], ubuntu.id));
    await waitForOpens(2);
    expect(pty.requested).toEqual(
      expect.arrayContaining([
        { leaf: ubuntu.activeLeafId, profileId: 'detected:wsl:Ubuntu' },
        { leaf: fresh.activeLeafId, profileId: undefined },
      ]),
    );
    expect(pty.reported).toEqual(
      expect.arrayContaining([
        { leaf: ubuntu.activeLeafId, profileId: 'detected:wsl:Ubuntu' },
        { leaf: fresh.activeLeafId, profileId: 'detected:pwsh' },
      ]),
    );
  });

  it('offers the default profile when the pane profile is gone, and retries with the same one', async () => {
    const tab = term({ kind: 'leaf', id: nextId * 100, profileId: 'mine' });
    const leaf = tab.activeLeafId;
    pty.failures.set(leaf, { code: 'profileNotFound', id: 'mine', message: 'terminal profile not found: mine' });
    await render(shell([tab], tab.id));
    await waitForRequests(1);
    await tick();
    expect(host.textContent).toContain('terminal profile not found: mine');

    await act(async () => button('Retry')?.click());
    await waitForRequests(2);
    expect(pty.requested[1]).toEqual({ leaf, profileId: 'mine' });

    pty.failures.delete(leaf);
    await act(async () => button('Open with default profile')?.click());
    await waitForOpens(1);
    expect(pty.requested[2]).toEqual({ leaf, profileId: undefined });
    expect(pty.reported).toEqual([{ leaf, profileId: 'detected:pwsh' }]);
    expect(button('Open with default profile')).toBeUndefined();
  });
});

describe('the profile decides what a pane does when its process exits (E14-15)', () => {
  /** A button by its label; the exit bar's buttons also show their key. */
  const button = (name: string) =>
    [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith(name)) as HTMLButtonElement | undefined;

  async function exited(profileId: string, code: number) {
    const tab = term({ kind: 'leaf', id: nextId * 100, profileId });
    await render(shell([tab], tab.id));
    await waitForOpens(1);
    await act(async () => pty.exit.get(tab.activeLeafId)?.(code));
    await tick();
    return tab.activeLeafId;
  }

  it('closes the pane, as before', async () => {
    const leaf = await exited('closes', 0);
    expect(pty.closedByExit).toEqual([{ leaf, code: 0 }]);
    expect(host.textContent).not.toContain('Process exited');
  });

  it('keeps the pane and its output with a notice', async () => {
    await exited('stays', 3);
    expect(pty.closedByExit).toEqual([]);
    expect(host.textContent).toMatch(/Process exited\s*code 3/);
    expect(button('Restart')).toBeUndefined();
  });

  it('asks, then restarts with the same profile', async () => {
    const leaf = await exited('asks', 1);
    expect(pty.closedByExit).toEqual([]);
    expect(host.textContent).toMatch(/Process exited\s*code 1/);
    await act(async () => button('Restart')?.click());
    await waitForOpens(2);
    expect(pty.requested.map((r) => r.profileId)).toEqual(['asks', 'asks']);
    expect(pty.opened).toEqual([leaf, leaf]);
    expect(host.textContent).not.toContain('Process exited');
  });

  it('asks, then closes the pane', async () => {
    const leaf = await exited('asks', 0);
    await act(async () => button('Close pane')?.click());
    expect(pty.closedByExit).toEqual([{ leaf, code: 0 }]);
  });

  it('waits for the profiles to be listed before showing the notice', async () => {
    listed.set(null);
    await exited('stays', 3);
    expect(host.textContent).not.toContain('Process exited');
    await act(async () => listed.set({ ...CLOSE_BEHAVIORS }));
    expect(pty.closedByExit).toEqual([]);
    expect(host.textContent).toMatch(/Process exited\s*code 3/);
  });

  it('waits for the profiles to be listed before closing the pane', async () => {
    listed.set(null);
    const leaf = await exited('closes', 0);
    expect(pty.closedByExit).toEqual([]);
    await act(async () => listed.set({ ...CLOSE_BEHAVIORS }));
    expect(pty.closedByExit).toEqual([{ leaf, code: 0 }]);
  });

  it('keeps the notice when the profile changes after the exit', async () => {
    await exited('stays', 3);
    await act(async () => listed.set({ ...CLOSE_BEHAVIORS, stays: 'close' }));
    expect(pty.closedByExit).toEqual([]);
    expect(host.textContent).toMatch(/Process exited\s*code 3/);
  });
});

describe('each pane looks as its profile says (E14-16)', () => {
  it('waits for the saved preferences before starting the terminal', async () => {
    usePreferencesStore.setState({ settled: false });
    const tab = term();
    await render(shell([tab], tab.id));
    expect(pty.requested).toEqual([]);
    await act(async () => usePreferencesStore.setState({ settled: true }));
    await waitForOpens(1);
  });

  it('waits for the profiles to be listed before starting the terminal', async () => {
    appearances.set(null);
    const tab = term();
    await render(shell([tab], tab.id));
    expect(pty.requested).toEqual([]);
    await act(async () => appearances.set({}));
    await waitForOpens(1);
  });

  it('applies an edited profile appearance to the open pane without reopening it', async () => {
    const tab = term();
    await render(shell([tab], tab.id));
    await waitForOpens(1);
    const before = { themes: terminal.themes, fonts: terminal.fonts };

    await act(async () =>
      appearances.set({
        'detected:pwsh': { themeId: secondTheme.id, cursorStyle: 'underline', fontSize: 21 },
      }),
    );
    for (let i = 0; i < 20; i++) await tick();

    expect(terminal.themes).toBe(before.themes + 1);
    expect(terminal.cursors[terminal.cursors.length - 1]).toBe('underline');
    expect(terminal.fonts).toBe(before.fonts + 1);
    expect(pty.opened).toEqual([tab.activeLeafId]);
    expect(pty.closed).toEqual([]);
  });

  it('draws the global font, with one warning per font, when the renderer has no room for its own', async () => {
    const tab = term();
    await render(shell([tab], tab.id));
    await waitForOpens(1);
    const globalSize = usePreferencesStore.getState().terminalFontSize;
    terminal.fits = (size) => size === globalSize;

    for (const fontSize of [21, 22, 21]) {
      await act(async () => appearances.set({ 'detected:pwsh': { fontSize } }));
      for (let i = 0; i < 20; i++) await tick();
    }

    expect(terminal.fontSizes).toEqual([globalSize, globalSize, globalSize]);
    expect(terminal.warnings).toEqual(['Too many terminal fonts', 'Too many terminal fonts']);
    expect(pty.opened).toEqual([tab.activeLeafId]);
  });

  it('pads the pane as its profile says, and not while a full-screen program runs (E14-21)', async () => {
    const padded = { top: 8, right: 12, bottom: 8, left: 12 };
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    appearances.set({ 'detected:pwsh': { padding: padded } });
    const tab = term();
    await render(shell([tab], tab.id));
    await waitForOpens(1);
    const last = () => terminal.paddings[terminal.paddings.length - 1];
    expect(last()).toEqual(padded);

    const switchScreen = terminal.alternateScreen.get(tab.activeLeafId);
    await act(async () => switchScreen?.(true));
    expect(last()).toEqual(none);
    await act(async () => switchScreen?.(false));
    expect(last()).toEqual(padded);

    const wider = { top: 4, right: 20, bottom: 4, left: 20 };
    await act(async () => appearances.set({ 'detected:pwsh': { padding: wider } }));
    for (let i = 0; i < 5; i++) await tick();
    expect(last()).toEqual(wider);
    expect(pty.opened).toEqual([tab.activeLeafId]);
    expect(pty.closed).toEqual([]);
  });

  it('keeps its font, with a warning, when not even the global font has room', async () => {
    const tab = term();
    await render(shell([tab], tab.id));
    await waitForOpens(1);
    terminal.fits = () => false;
    await act(async () => appearances.set({ 'detected:pwsh': { fontSize: 31 } }));
    for (let i = 0; i < 20; i++) await tick();
    expect(terminal.fontSizes).toEqual([]);
    expect(terminal.warnings).toEqual(['Too many terminal fonts']);
    expect(host.textContent).not.toContain('Unable to display terminal');
  });

  it('shows the renderer error and its retry when a font fails to apply', async () => {
    const tab = term();
    await render(shell([tab], tab.id));
    await waitForOpens(1);
    terminal.fontFails = true;
    await act(async () => appearances.set({ 'detected:pwsh': { fontSize: 32 } }));
    for (let i = 0; i < 20; i++) await tick();
    expect(host.textContent).toContain('Unable to display terminal');
    expect(host.textContent).toContain('Retry display');
    expect(pty.closed).toEqual([]);

    // The retry builds a new surface and tries the font that failed on it.
    terminal.fontFails = false;
    const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Retry display');
    await act(async () => retry?.click());
    for (let i = 0; i < 20; i++) await tick();
    expect(host.textContent).not.toContain('Unable to display terminal');
    expect(terminal.fontSizes[terminal.fontSizes.length - 1]).toBe(32);
    expect(pty.opened).toEqual([tab.activeLeafId]);
  });

  it('keeps a cursor changed while the terminal starts through a renderer retry', async () => {
    let release = () => {};
    terminal.modelGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tab = term();
    await render(shell([tab], tab.id));
    await act(async () => appearances.set({ 'detected:pwsh': { cursorStyle: 'underline' } }));
    release();
    await waitForOpens(1);
    for (let i = 0; i < 10; i++) await tick();
    // A font that fails to apply shows the renderer error; its retry rebuilds the surface.
    terminal.fontFails = true;
    await act(async () => appearances.set({ 'detected:pwsh': { cursorStyle: 'underline', fontSize: 33 } }));
    for (let i = 0; i < 20; i++) await tick();
    terminal.fontFails = false;
    const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Retry display');
    await act(async () => retry?.click());
    for (let i = 0; i < 20; i++) await tick();
    expect(terminal.startCursors[terminal.startCursors.length - 1]).toBe('underline');
  });

  it('draws a font asked for while the terminal is still starting', async () => {
    let release = () => {};
    terminal.modelGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tab = term();
    await render(shell([tab], tab.id));
    // The fonts are measured; the model, and so the surface, is not there yet.
    await act(async () => appearances.set({ 'detected:pwsh': { fontSize: 23 } }));
    for (let i = 0; i < 5; i++) await tick();
    release();
    await waitForOpens(1);
    for (let i = 0; i < 20; i++) await tick();
    const drawn = terminal.fontSizes.length
      ? terminal.fontSizes[terminal.fontSizes.length - 1]
      : terminal.startSizes[terminal.startSizes.length - 1];
    expect(drawn).toBe(23);
  });
});
