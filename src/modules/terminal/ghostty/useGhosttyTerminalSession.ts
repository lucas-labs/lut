import {
  ensureMonoFontsLoaded,
  resolveFontFamily,
  subscribeSymbolFonts,
  symbolFontEpoch,
} from '@/lib/fonts';
import { NO_PADDING, type Padding } from '@/lib/padding';
import { usePreferencesStore } from '@/modules/settings/preferences';
import { useSpaces } from '@/modules/spaces/lib/useSpaces';
import type { TerminalBackendKind } from '@/modules/terminal/backend/contracts';
import { loadSessionRenderer } from '@/modules/terminal/ghostty/loadSessionRenderer';
import { replaceSessionSurface } from '@/modules/terminal/ghostty/replaceSessionSurface';
import { initializeSessionGeneration as startSessionInitialization } from '@/modules/terminal/ghostty/sessionInitialization';
import {
  fillsFullScreen,
  type FullScreenPadding,
  needsRunningPrograms,
} from '@/modules/terminal/lib/fullScreenPadding';
import { LatestClipboardWrite } from '@/modules/terminal/lib/LatestClipboardWrite';
import { setLeafPresentation } from '@/modules/terminal/lib/ptyPresentation';
import { PtyResizeDelivery } from '@/modules/terminal/lib/ptyResizeDelivery';
import type { PaneAppearance, PaneFont } from '@/modules/terminal/lib/usePaneAppearance';
import type { TerminalSearchController } from '@/modules/terminal/search/TerminalSearchController';
import { currentWorkspaceEnv, workspaceScopeKey } from '@/modules/workspace';
import { invoke } from '@tauri-apps/api/core';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { toast } from 'sonner';
import { isAgentActivePty } from '../lib/agentActivity';
import { type LaunchError, PtyLaunchError } from '../lib/launchError';
import { openPty, type PtySession } from '../lib/pty-bridge';
import { writeTerminalClipboard } from '../lib/terminalClipboard';
import { GhosttySemanticEventRouter } from './core/GhosttySemanticEventRouter';
import { getGhosttyCoreRuntime } from './GhosttyCoreRuntime';
import type { GhosttyTerminalModelApi } from './GhosttyTerminalModel';
import { prepareHintedFonts } from './gpu/hintedGlyphs';
import {
  fontSpecKey,
  measureTerminalFont,
  rgbToInt,
  type TerminalFontMetrics,
  type TerminalFontSpec,
  type TerminalGpuTheme,
} from './gpu/terminalVisuals';
import { getWebGpuTerminalRuntime } from './gpu/WebGpuTerminalRuntime';
import { WebGpuTerminalSurface } from './gpu/WebGpuTerminalSurface';
import { GhosttyInputController } from './input/GhosttyInputController';
import { enqueueTerminalInput } from './input/terminalInputEncoding';
import type {
  WebGlTerminalSurface,
  WebGlTerminalSurfaceOptions,
} from './webgl/WebGlTerminalSurface';

type GhosttyBackend = Extract<TerminalBackendKind, `ghostty-${string}`>;
type GhosttySurface = WebGpuTerminalSurface | WebGlTerminalSurface;
type GhosttySurfaceBaseOptions = Omit<WebGlTerminalSurfaceOptions, 'onError'>;
type GhosttySessionFailure = {
  kind: 'startup' | 'renderer';
  message: string;
  /** Why native could not launch the terminal, when it said. */
  launch?: LaunchError;
};
type StartupFailure = { message: string; launch?: LaunchError };

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MAX_PENDING_INPUT_BYTES = 256 * 1024;
const MAX_WRITE_BATCH_BYTES = 64 * 1024;

type Callbacks = {
  onModel?: (model: GhosttyTerminalModelApi | null) => void;
  onError?: (error: GhosttySessionFailure | null) => void;
  onSearchReady?: (search: TerminalSearchController) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
  onTitle?: (title: string | null) => void;
  onProfile?: (profileId: string | undefined) => void;
};

/** What the pane's appearance gives a session; the font itself is `GhosttySession.font`. */
type SessionLook = {
  readonly theme: TerminalGpuTheme;
  readonly cursorStyle: PaneAppearance['cursorStyle'];
  readonly cursorBlink: boolean;
  readonly scrollback: number;
  /** Drawn instead of the pane's font when the renderer has no room for that one. */
  readonly globalFont: TerminalFontSpec;
  readonly padding: Padding;
  readonly fullScreen: FullScreenPadding;
};

type GhosttySession = {
  readonly leafId: number;
  readonly backend: GhosttyBackend;
  initialCwd: string | undefined;
  /** The profile the terminal opens with; none is the default one. Kept across restarts. */
  profileId: string | undefined;
  lastCwd: string | null;
  /** The last title the shell set (OSC 0/2), trimmed; null when it set none or an empty one. */
  lastTitle: string | null;
  model: GhosttyTerminalModelApi | null;
  surface: GhosttySurface | null;
  surfaceOptions: GhosttySurfaceBaseOptions | null;
  input: GhosttyInputController | null;
  cancelFocusRetry: (() => void) | null;
  pty: PtySession | null;
  ptyResize: PtyResizeDelivery;
  writer: BoundedPtyWriter;
  container: HTMLDivElement | null;
  callbacks: Callbacks;
  visible: boolean;
  focused: boolean;
  startupError: StartupFailure | null;
  rendererError: string | null;
  shellExited: boolean;
  /** How the shell exited, until the pane restarts it. */
  exitCode: number | null;
  /** OSC 133 has been seen, so `commandRunning` can be trusted. */
  promptIntegrated: boolean;
  commandRunning: boolean;
  /** The shell's prompts say whether a command started. */
  commandTracked: boolean;
  disposed: boolean;
  generation: number;
  initializing: Promise<void> | null;
  startup: GhosttyStartupTimings;
  /** The pane's font; the renderer may draw the global one instead (`fontThatFits`). */
  font: TerminalFontSpec;
  /** Counts font updates: an update still loading when a later one starts is dropped. */
  fontRevision: number;
  /** `null` until the pane resolves it; the terminal starts after that. */
  look: SessionLook | null;
  /** A full-screen program is running: the pane may drop its padding meanwhile (`fullScreen`). */
  alternateScreen: boolean;
  /** What runs in the pane since it went full screen, by `programName`; null until it is known. */
  fullScreenPrograms: readonly string[] | null;
  /** Counts the lookups of `fullScreenPrograms`: an answer to an earlier one is dropped. */
  fullScreenLookup: number;
  /** Room kept under the text for a bar the pane shows over its bottom edge, in CSS pixels. */
  barInset: number;
};

type GhosttyStartupTimings = {
  startedAt: number;
  fontsReadyMs: number | null;
  coreReadyMs: number | null;
  gpuReadyMs: number | null;
  modelReadyMs: number | null;
  surfaceReadyMs: number | null;
  ptyReadyMs: number | null;
  firstOutputMs: number | null;
  firstFrameMs: number | null;
  firstPromptMs: number | null;
};

const sessions = new Map<number, GhosttySession>();
const textEncoder = new TextEncoder();
const oscClipboard = new LatestClipboardWrite(writeTerminalClipboard);

type Options = {
  leafId: number;
  backend: GhosttyBackend;
  container: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  focused: boolean;
  initialCwd?: string;
  /** The pane's profile; none opens the default one. */
  profileId?: string;
  /** The pane's resolved appearance; the terminal starts once it is known. */
  appearance: PaneAppearance | null;
  onCwd?: (cwd: string) => void;
  /** The title the shell set (OSC 0/2); null when it cleared it or the terminal started again. */
  onTitle?: (title: string | null) => void;
  /** The profile that opened, so the pane keeps it. */
  onProfile?: (profileId: string | undefined) => void;
  onSearchReady?: (search: TerminalSearchController) => void;
};

/** Loaded on first use: only agent launches write at the prompt. */
const loadPromptInjection = () => import('../lib/promptInjection');

export function useGhosttyTerminalSession({
  leafId,
  backend,
  container,
  visible,
  focused,
  initialCwd,
  profileId,
  appearance,
  onSearchReady,
  onCwd,
  onTitle,
  onProfile,
}: Options) {
  const [model, setModel] = useState<GhosttyTerminalModelApi | null>(null);
  const [error, setError] = useState<GhosttySessionFailure | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const letterSpacing = usePreferencesStore((state) => state.terminalLetterSpacing);
  const zoomLevel = usePreferencesStore((state) => state.zoomLevel);
  const fullScreenFill = usePreferencesStore((state) => state.terminalFullScreenFill);
  const keepPadding = usePreferencesStore((state) => state.terminalFullScreenKeepPadding);
  const fullScreen = useMemo<FullScreenPadding>(
    () => ({ fill: fullScreenFill, keepPadding }),
    [fullScreenFill, keepPadding],
  );
  const symbols = useSyncExternalStore(subscribeSymbolFonts, symbolFontEpoch);
  const look = useMemo(() => {
    if (!appearance) return null;
    const spec = ({ fontFamily, fontSize, fontWeight }: PaneFont): TerminalFontSpec => ({
      family: resolveFontFamily(fontFamily),
      size: Math.max(4, Math.round(fontSize * zoomLevel)),
      lineHeight: 1.2,
      letterSpacing,
      weight: fontWeight,
      symbols,
    });
    return {
      font: spec(appearance.font),
      look: {
        theme: appearance.theme,
        cursorStyle: appearance.cursorStyle,
        cursorBlink: appearance.cursorBlink,
        scrollback: appearance.scrollback,
        globalFont: spec(appearance.globalFont),
        padding: appearance.padding,
        fullScreen,
      } satisfies SessionLook,
    };
  }, [appearance, letterSpacing, zoomLevel, symbols, fullScreen]);
  // The session outlives renders: it reports to the pane's latest callbacks.
  const reportSearchReady = useEffectEvent((search: TerminalSearchController) =>
    onSearchReady?.(search),
  );
  const reportCwd = useEffectEvent((cwd: string) => onCwd?.(cwd));
  const reportTitle = useEffectEvent((title: string | null) => onTitle?.(title));
  const reportProfile = useEffectEvent((id: string | undefined) => onProfile?.(id));
  const initialCwdRef = useRef(initialCwd);
  const initialProfileRef = useRef(profileId);

  useEffect(() => {
    const session = ensureSession(
      leafId,
      backend,
      initialCwdRef.current,
      initialProfileRef.current,
    );
    const node = container.current;
    session.container = node;
    setModel(session.model);
    session.callbacks = {
      onModel: setModel,
      onError: setError,
      onSearchReady: (search) => reportSearchReady(search),
      onExit: setExitCode,
      onCwd: (cwd) => reportCwd(cwd),
      onTitle: (title) => reportTitle(title),
      onProfile: (id) => reportProfile(id),
    };
    setError(sessionFailure(session));
    setExitCode(session.exitCode);
    if (session.surface) {
      session.callbacks.onSearchReady?.(session.surface.searchController());
    }
    if (session.lastCwd !== null) session.callbacks.onCwd?.(session.lastCwd);
    // Also a cleared title: it may have been cleared while the pane was detached. The store ignores an unchanged one.
    session.callbacks.onTitle?.(session.lastTitle);
    return () => {
      if (session.container === node) {
        session.cancelFocusRetry?.();
        session.surface?.detach();
        session.container = null;
        session.callbacks = {};
      }
    };
  }, [leafId, backend, container]);

  useEffect(() => {
    const session = sessions.get(leafId);
    if (!look || !session || session.backend !== backend) return;
    applySessionLook(session, look.font, look.look);
  }, [leafId, backend, look]);

  // Declared after the look is applied, so a terminal starts with it.
  const resolved = look !== null;
  useEffect(() => {
    const session = sessions.get(leafId);
    if (resolved && session?.backend === backend) void initializeSession(session);
  }, [leafId, backend, container, resolved]);

  useEffect(() => {
    const session = ensureSession(
      leafId,
      backend,
      initialCwdRef.current,
      initialProfileRef.current,
    );
    session.visible = visible;
    session.focused = focused;
    if (!visible || !focused) session.cancelFocusRetry?.();
    setLeafPresentation(leafId, visible, focused);
    const surface = session.surface;
    if (!surface || session.rendererError) return;
    if (visible && session.container) {
      try {
        attachGhosttySurface(session, surface);
      } catch (error) {
        reportRendererFailure(session, toError(error));
      }
    } else {
      surface.setVisible(false);
      surface.detach();
    }
  }, [leafId, backend, visible, focused]);

  const write = useCallback(
    (data: string) => {
      writeToGhosttySession(leafId, data);
    },
    [leafId],
  );
  const writeAtPrompt = useCallback(
    async (data: string) => {
      const expected = sessions.get(leafId);
      const pty = expected?.pty;
      if (!pty) return false;
      const { writeAtShellPrompt } = await loadPromptInjection();
      const session = sessions.get(leafId);
      if (!session || session !== expected || session.pty !== pty) return false;
      return writeAtShellPrompt(
        session,
        data,
        () => !!session.pty && isAgentActivePty(session.pty.id),
      );
    },
    [leafId],
  );
  const focus = useCallback(() => focusGhosttySession(leafId), [leafId]);
  const getBuffer = useCallback(
    (maxLines = 200) => sessions.get(leafId)?.model?.readText(maxLines) ?? null,
    [leafId],
  );
  const getSelection = useCallback(
    () => sessions.get(leafId)?.surface?.getSelection() ?? null,
    [leafId],
  );
  const retry = useCallback(() => {
    const session = sessions.get(leafId);
    if (session?.rendererError) {
      retryGhosttyRenderer(session);
      return;
    }
    void respawnGhosttySession(leafId).catch((error: unknown) =>
      setError({ kind: 'startup', message: toError(error).message }),
    );
  }, [leafId]);

  /** Starts an exited shell again, with the same profile, in the folder it was last in. */
  const restart = useCallback(() => {
    const cwd = sessions.get(leafId)?.lastCwd ?? undefined;
    setExitCode(null);
    void respawnGhosttySession(leafId, { cwd }).catch((error: unknown) =>
      setError({ kind: 'startup', message: toError(error).message }),
    );
  }, [leafId]);

  /** Opens the pane again with another profile; none is the default one. */
  const openWithProfile = useCallback(
    (profileId?: string) => {
      void respawnGhosttySession(leafId, { profileId }).catch((error: unknown) =>
        setError({ kind: 'startup', message: toError(error).message }),
      );
    },
    [leafId],
  );

  /** Keeps `px` under the text, so a bar over the pane's bottom edge hides none of it. */
  const setBarInset = useCallback(
    (px: number) => {
      const session = sessions.get(leafId);
      if (!session || session.barInset === px) return;
      session.barInset = px;
      applyPadding(session);
    },
    [leafId],
  );

  return useMemo(
    () => ({
      error,
      exitCode,
      model,
      retry,
      restart,
      openWithProfile,
      setBarInset,
      write,
      writeAtPrompt,
      focus,
      getBuffer,
      getSelection,
    }),
    [
      write,
      writeAtPrompt,
      focus,
      getBuffer,
      getSelection,
      error,
      exitCode,
      retry,
      restart,
      openWithProfile,
      setBarInset,
      model,
    ],
  );
}

/** Applies a new appearance to a running terminal, without restarting it. */
function applySessionLook(
  session: GhosttySession,
  font: TerminalFontSpec,
  look: SessionLook,
): void {
  const previous = session.look;
  session.look = look;
  if (!previous) {
    // Not started yet: it starts with this font.
    session.font = font;
    return;
  }
  if (previous.theme !== look.theme) applyThemeToSession(session);
  if (previous.cursorBlink !== look.cursorBlink || previous.cursorStyle !== look.cursorStyle) {
    session.surface?.setCursorOptions(look.cursorBlink, look.cursorStyle);
    if (session.surfaceOptions) {
      session.surfaceOptions = {
        ...session.surfaceOptions,
        cursorBlink: look.cursorBlink,
        cursorStyle: look.cursorStyle,
      };
    }
  }
  if (previous.padding !== look.padding || previous.fullScreen !== look.fullScreen) {
    updateFullScreenPadding(session);
  }
  // A pane drawn with the global font because its own did not fit is measured again.
  const globalChanged = fontSpecKey(previous.globalFont) !== fontSpecKey(look.globalFont);
  void updateSessionFont(session, font, globalChanged);
}

function applyThemeToSession(session: GhosttySession): void {
  if (!session.model || !session.surface || !session.look) return;
  const { theme } = session.look;
  session.model.setColors(
    rgbToInt(theme.foreground),
    rgbToInt(theme.background),
    rgbToInt(theme.cursor),
    theme.palette.map(rgbToInt),
  );
  session.surface.setTheme(theme);
  void session.pty?.setColors(theme).catch(() => {});
  if (session.surfaceOptions) session.surfaceOptions = { ...session.surfaceOptions, theme };
}

export function hasGhosttySession(leafId: number): boolean {
  return sessions.has(leafId);
}

export function writeToGhosttySession(leafId: number, data: string): boolean {
  const session = sessions.get(leafId);
  if (!session || session.shellExited || session.disposed) return false;
  return enqueueTerminalInput(session, textEncoder.encode(data));
}

export function clearGhosttySession(leafId: number): boolean {
  const session = sessions.get(leafId);
  if (!session?.model || session.disposed) return false;
  session.model.clear();
  focusGhosttySession(leafId);
  return true;
}

export function pasteIntoGhosttySession(leafId: number, text: string): boolean {
  const session = sessions.get(leafId);
  if (!session?.input) return false;
  session.input.paste(text);
  session.surface?.focus();
  return true;
}

export function ghosttySelectionForLeaf(leafId: number): string | null {
  return sessions.get(leafId)?.surface?.getSelection() ?? null;
}

export function ghosttyCwdForLeaf(leafId: number): string | null {
  return sessions.get(leafId)?.lastCwd ?? null;
}

export function ghosttyFocusedLeaf(): number | null {
  for (const [leafId, session] of sessions) {
    if (session.visible && session.focused) return leafId;
  }
  return null;
}

export async function whenGhosttySessionReady(leafId: number): Promise<boolean> {
  const session = sessions.get(leafId);
  if (!session) return false;
  await session.initializing;
  return !!session.pty && !!session.model && !session.startupError && !session.disposed;
}

export function ghosttyPtyIdForLeaf(leafId: number): number | null {
  return sessions.get(leafId)?.pty?.id ?? null;
}

export function ghosttyLeafIdForPty(ptyId: number): number | null {
  for (const [leafId, session] of sessions) {
    if (session.pty?.id === ptyId) return leafId;
  }
  return null;
}

export async function ghosttyLeafHasForegroundProcess(leafId: number): Promise<boolean> {
  const session = sessions.get(leafId);
  if (!session?.pty || session.shellExited) return false;
  try {
    return await invoke<boolean>('pty_has_foreground_process', {
      id: session.pty.id,
    });
  } catch (error) {
    console.error('[lut] Ghostty pty_has_foreground_process failed for leaf', leafId, error);
    return false;
  }
}

export function disposeGhosttySession(leafId: number): boolean {
  const session = sessions.get(leafId);
  if (!session) return false;
  session.disposed = true;
  session.generation += 1;
  session.cancelFocusRetry?.();
  session.input?.dispose();
  session.surface?.dispose();
  session.model?.dispose();
  session.ptyResize.reset();
  session.writer.dispose();
  void session.pty?.close();
  session.pty = null;
  sessions.delete(leafId);
  return true;
}

/** Starts the pane's terminal again; `launch` changes what it opens with, else it is the same. */
async function respawnGhosttySession(
  leafId: number,
  launch: { cwd?: string; profileId?: string } = {},
): Promise<boolean> {
  const session = sessions.get(leafId);
  if (!session || session.disposed) return false;
  session.generation += 1;
  session.cancelFocusRetry?.();
  session.input?.dispose();
  session.input = null;
  session.surface?.dispose();
  session.surface = null;
  session.surfaceOptions = null;
  session.model?.dispose();
  session.model = null;
  session.callbacks.onModel?.(null);
  session.ptyResize.reset();
  session.writer.detach();
  session.writer.clear();
  await session.pty?.close();
  session.pty = null;
  session.shellExited = false;
  session.exitCode = null;
  session.promptIntegrated = false;
  session.commandRunning = false;
  session.commandTracked = false;
  session.lastCwd = null;
  if (session.lastTitle !== null) {
    session.lastTitle = null;
    session.callbacks.onTitle?.(null);
  }
  session.alternateScreen = false;
  session.fullScreenPrograms = null;
  session.fullScreenLookup += 1;
  session.barInset = 0;
  session.initialCwd = launch.cwd ?? session.initialCwd;
  if ('profileId' in launch) session.profileId = launch.profileId;
  session.startupError = null;
  session.rendererError = null;
  session.callbacks.onError?.(null);
  session.initializing = null;
  await initializeSession(session);
  return true;
}

/** Live sessions, for the lazily loaded diagnostics (`sessionDiagnostics.ts`). */
export function ghosttySessionsForDiagnostics() {
  return sessions.values();
}

function ensureSession(
  leafId: number,
  backend: GhosttyBackend,
  initialCwd?: string,
  profileId?: string,
): GhosttySession {
  const existing = sessions.get(leafId);
  if (existing) {
    if (existing.backend !== backend) {
      throw new Error(`Ghostty backend changed for live leaf ${leafId}; reload is required`);
    }
    return existing;
  }
  const ptyResize = new PtyResizeDelivery((cols, rows) => {
    const pty = sessions.get(leafId)?.pty;
    if (!pty) return false;
    void pty.resize(cols, rows);
    return true;
  });
  const session: GhosttySession = {
    leafId,
    backend,
    initialCwd,
    profileId,
    lastCwd: null,
    lastTitle: null,
    model: null,
    surface: null,
    surfaceOptions: null,
    input: null,
    cancelFocusRetry: null,
    pty: null,
    ptyResize,
    writer: new BoundedPtyWriter((error) => {
      console.error('[lut] Ghostty PTY write failed:', error);
    }),
    container: null,
    callbacks: {},
    visible: false,
    focused: false,
    startupError: null,
    rendererError: null,
    shellExited: false,
    exitCode: null,
    promptIntegrated: false,
    commandRunning: false,
    commandTracked: false,
    barInset: 0,
    disposed: false,
    generation: 0,
    initializing: null,
    startup: createStartupTimings(),
    font: {
      family: 'monospace',
      size: 14,
      lineHeight: 1.2,
      letterSpacing: 0,
      weight: '400',
    },
    fontRevision: 0,
    look: null,
    alternateScreen: false,
    fullScreenPrograms: null,
    fullScreenLookup: 0,
  };
  sessions.set(leafId, session);
  return session;
}

function initializeSession(session: GhosttySession): Promise<void> {
  return startSessionInitialization(
    session,
    (generation) => initializeSessionGeneration(session, generation),
    (error) => {
      session.cancelFocusRetry?.();
      session.shellExited = session.pty === null;
      if (!session.pty) {
        session.input?.dispose();
        session.input = null;
        session.surface?.dispose();
        session.surface = null;
        session.surfaceOptions = null;
        session.model?.dispose();
        session.model = null;
        session.writer.clear();
        session.ptyResize.reset();
      }
      session.startupError = {
        message: toError(error).message,
        launch: error instanceof PtyLaunchError ? error.launch : undefined,
      };
      console.error('[lut] Ghostty session initialization failed:', error);
      session.callbacks.onError?.(sessionFailure(session));
    },
  );
}

async function initializeSessionGeneration(
  session: GhosttySession,
  generation: number,
): Promise<void> {
  const look = session.look;
  if (!look) throw new Error('The terminal started before its appearance was resolved');
  const fontRevision = session.fontRevision;
  const startup = createStartupTimings();
  session.startup = startup;
  const alive = () => !session.disposed && generation === session.generation;
  const mark = (key: keyof Omit<GhosttyStartupTimings, 'startedAt'>) => {
    if (alive() && startup[key] === null) {
      startup[key] = performance.now() - startup.startedAt;
    }
  };
  const { theme } = look;
  const coreRuntime = getGhosttyCoreRuntime();
  const metricsPromise = (async () => {
    await ensureMonoFontsLoaded();
    await document.fonts.ready;
    await prepareHintedFonts(session.font.family, session.font.weight);
    const initialFont = session.font;
    let metrics = await measureTerminalFont(initialFont);
    if (fontSpecKey(initialFont) !== fontSpecKey(session.font)) {
      await prepareHintedFonts(session.font.family, session.font.weight);
      metrics = await measureTerminalFont(session.font);
    }
    mark('fontsReadyMs');
    return metrics;
  })();
  const corePromise = coreRuntime.preload().then(() => mark('coreReadyMs'));
  const webGpuPreload = { error: null as Error | null };
  const rendererPromise =
    session.backend === 'ghostty-webgpu'
      ? getWebGpuTerminalRuntime()
          .catch((error: unknown) => {
            webGpuPreload.error = toError(error);
          })
          .then(() => mark('gpuReadyMs'))
      : Promise.resolve().then(() => mark('gpuReadyMs'));
  const [measured] = await Promise.all([metricsPromise, corePromise, rendererPromise]);
  if (!alive()) return;
  // With no room for any font, the WebGPU surface fails to build and the pane falls back to WebGL.
  const metrics =
    session.backend === 'ghostty-webgpu' && !webGpuPreload.error
      ? ((await getWebGpuTerminalRuntime().then((runtime) =>
          fontThatFits(session, measured, (wanted) => runtime.hasRoomForAtlas(wanted)),
        )) ?? measured)
      : measured;
  if (!alive()) return;

  const semanticEvents = new GhosttySemanticEventRouter({
    onCwd: (cwd) => {
      if (session.lastCwd === cwd) return;
      session.lastCwd = cwd;
      session.callbacks.onCwd?.(cwd);
    },
    onTitle: (raw) => {
      const title = raw.trim() || null;
      if (session.lastTitle === title) return;
      session.lastTitle = title;
      session.callbacks.onTitle?.(title);
    },
    onClipboard: (text) => {
      oscClipboard.enqueue(text);
    },
    onOverflow: (dropped) => {
      console.warn(`[lut] Ghostty semantic event queue dropped ${dropped} event(s)`);
    },
    onPromptEnd: (reportsCommandStart) => {
      session.commandTracked = reportsCommandStart;
    },
    onCommandState: (running) => {
      session.promptIntegrated = true;
      session.commandRunning = running;
      session.commandTracked = false;
      if (!running) mark('firstPromptMs');
    },
  });
  const model = await coreRuntime.createModel({
    leafId: session.leafId,
    backend: session.backend,
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    config: {
      scrollbackLimit: look.scrollback,
      fgColor: rgbToInt(theme.foreground),
      bgColor: rgbToInt(theme.background),
      cursorColor: rgbToInt(theme.cursor),
      palette: theme.palette.map(rgbToInt),
      cursorStyle: look.cursorStyle,
      cursorBlink: look.cursorBlink,
    },
    onReply: (bytes) => session.writer.enqueue(bytes),
    onEvent: (event) => semanticEvents.handle(event),
  });
  if (session.disposed || generation !== session.generation) {
    model.dispose();
    return;
  }
  mark('modelReadyMs');
  session.model = model;
  // Full-screen programs may fill the pane: its padding goes while they run, with one refit each way.
  model.subscribeAlternateScreen((active) => {
    if (session.model !== model) return;
    session.alternateScreen = active;
    session.fullScreenPrograms = null;
    session.fullScreenLookup += 1;
    updateFullScreenPadding(session);
  });
  session.callbacks.onModel?.(model);
  const surfaceBaseOptions: GhosttySurfaceBaseOptions = {
    model,
    metrics,
    theme,
    cursorBlink: look.cursorBlink,
    cursorStyle: look.cursorStyle,
    onResize: (cols: number, rows: number) => {
      session.ptyResize.send(cols, rows);
    },
    onFirstFrame: () => mark('firstFrameMs'),
    onRequestFocus: () => focusGhosttySession(session.leafId),
    // Opening, confirming and resolving links is only needed on a click.
    onOpenLink: (link) => {
      const workspace = { ...currentWorkspaceEnv() };
      const space = useSpaces.getState().activeId;
      const isCurrent = () =>
        !session.disposed &&
        session.visible &&
        sessions.get(session.leafId) === session &&
        useSpaces.getState().activeId === space &&
        workspaceScopeKey(currentWorkspaceEnv()) === workspaceScopeKey(workspace);
      const context = {
        cwd: session.lastCwd ?? session.initialCwd ?? null,
        workspace,
        isCurrent,
        focus: () => {
          if (isCurrent()) focusGhosttySession(session.leafId);
        },
      };
      void import('@/modules/terminal/lib/terminalLinks')
        .then(({ activateTerminalLink }) => activateTerminalLink(link, context))
        .catch(context.focus);
    },
  };
  session.surfaceOptions = surfaceBaseOptions;
  let webGpuFallbackStarted = false;
  const webGpuSurfaceOptions = {
    ...surfaceBaseOptions,
    onError: (error: Error) => {
      logSurfaceError('ghostty-webgpu', error);
      if (webGpuFallbackStarted) return;
      webGpuFallbackStarted = true;
      queueMicrotask(() => {
        fallbackWebGpuSurface(session, generation, surfaceBaseOptions, error);
      });
    },
  };
  let surface: GhosttySurface | null = null;
  if (session.backend === 'ghostty-webgpu' && !webGpuPreload.error) {
    try {
      surface = await WebGpuTerminalSurface.create(webGpuSurfaceOptions);
    } catch (error) {
      webGpuPreload.error = toError(error);
    }
  }
  if (!surface) {
    surface = await loadSessionRenderer(
      session,
      generation,
      () => import('@/modules/terminal/ghostty/webgl/WebGlTerminalSurface'),
      (renderer) =>
        createWebGlFallbackSurface(
          session,
          generation,
          surfaceBaseOptions,
          renderer.WebGlTerminalSurface,
        ),
    );
    if (!surface) return;
  }
  if (webGpuPreload.error) {
    console.warn(
      '[lut] WebGPU initialization failed; preserving the Ghostty session with WebGL:',
      webGpuPreload.error.message,
    );
  }
  if (session.disposed || generation !== session.generation) {
    surface.dispose();
    model.dispose();
    return;
  }
  mark('surfaceReadyMs');
  session.surface = surface;
  session.input = createGhosttyInput(session, model, surface);

  if (session.visible && session.container) {
    try {
      attachGhosttySurface(session, surface);
    } catch (error) {
      if (surface.backend !== 'ghostty-webgpu') throw error;
      try {
        surface = await replaceGhosttySurface(session, generation, surfaceBaseOptions);
      } catch (fallbackError) {
        throw new Error(
          `WebGPU surface attachment failed (${toError(error).message}); WebGL fallback also failed (${toError(fallbackError).message})`,
        );
      }
      if (!surface) return;
      webGpuFallbackStarted = true;
      console.warn(
        '[lut] WebGPU surface attachment failed; preserved the Ghostty session with WebGL:',
        toError(error).message,
      );
    }
  }
  session.callbacks.onSearchReady?.(surface.searchController());

  const startCols = model.cols;
  const startRows = model.rows;
  const pty = await openPty(
    startCols,
    startRows,
    {
      onData: (bytes) => {
        if (!session.disposed && generation === session.generation) {
          mark('firstOutputMs');
          model.write(bytes);
        }
      },
      onExit: (code) => {
        if (session.disposed || generation !== session.generation) return;
        session.shellExited = true;
        session.exitCode = code;
        session.cancelFocusRetry?.();
        session.writer.detach();
        session.pty = null;
        session.callbacks.onExit?.(code);
      },
    },
    {
      profileId: session.profileId,
      cwd: session.initialCwd,
      paneId: session.leafId,
      colors: theme,
    },
  );
  if (session.disposed || generation !== session.generation) {
    await pty.close();
    return;
  }
  if (session.shellExited) {
    await pty.close();
    return;
  }
  mark('ptyReadyMs');
  session.pty = pty;
  // No profile at all opens the system's shell; the pane then keeps none, so a split opens the default.
  session.profileId = pty.profileId ?? undefined;
  session.callbacks.onProfile?.(session.profileId);
  session.writer.attach(pty);
  if (model.cols !== startCols || model.rows !== startRows) {
    session.ptyResize.send(model.cols, model.rows);
  }
  // The appearance can change while fonts, WASM and the renderer load; a change before the PTY
  // was attached found no PTY to tell, so look again.
  if (session.look?.theme !== theme) applyThemeToSession(session);
  const current = session.look;
  if (
    current &&
    (current.cursorBlink !== look.cursorBlink || current.cursorStyle !== look.cursorStyle)
  ) {
    surface.setCursorOptions(current.cursorBlink, current.cursorStyle);
    // A renderer retry or fallback builds its surface from these.
    if (session.surfaceOptions) {
      session.surfaceOptions = {
        ...session.surfaceOptions,
        cursorBlink: current.cursorBlink,
        cursorStyle: current.cursorStyle,
      };
    }
  }
  // A font update with no surface yet to apply to (a symbol face that arrived, a profile edit) is
  // applied now.
  if (session.fontRevision !== fontRevision) void updateSessionFont(session, session.font, true);
}

function createGhosttyInput(
  session: GhosttySession,
  model: GhosttyTerminalModelApi,
  surface: GhosttySurface,
): GhosttyInputController {
  return new GhosttyInputController({
    model,
    input: surface.inputElement(),
    pointerTarget: surface.eventTarget(),
    cellSize: () => ({
      width: surface.cellSize().width,
      height: surface.cellSize().height,
    }),
    gridShiftY: () => surface.gridShiftY(),
    scrollSpeed: () => usePreferencesStore.getState().terminalScrollSpeed,
    macOptionAsAlt: () => usePreferencesStore.getState().terminalMacOptionAsAlt,
    onData: (bytes) => {
      enqueueTerminalInput(session, bytes);
    },
    getSelection: () => surface.getSelection(),
    onCopy: () => {
      const text = surface.getSelection();
      if (!text) return false;
      void writeTerminalClipboard(text).catch(() => {});
      return true;
    },
  });
}

function focusGhosttySession(leafId: number): void {
  const session = sessions.get(leafId);
  if (session) focusSessionSurface(session, session.surface);
}

function focusSessionSurface(session: GhosttySession, surface: GhosttySurface | null): void {
  session.cancelFocusRetry?.();
  session.cancelFocusRetry = null;
  if (!surface) return;
  surface.focus();
  const input = surface.inputElement();
  if (document.activeElement === input) return;
  // A refused focus (a hidden layer, an activating window) is retried, from a
  // chunk that only loads when it happens.
  let cancel: (() => void) | undefined;
  let cancelled = false;
  const generation = session.generation;
  session.cancelFocusRetry = () => {
    cancelled = true;
    cancel?.();
  };
  void import('./input/focusRetry').then(({ focusUntilActive }) => {
    if (!cancelled)
      cancel = focusUntilActive(
        input,
        () => surface.focus(),
        () =>
          !cancelled &&
          session.focused &&
          session.visible &&
          !session.disposed &&
          !session.shellExited &&
          !session.rendererError &&
          session.container !== null &&
          session.generation === generation &&
          session.surface === surface &&
          sessions.get(session.leafId) === session,
      );
  });
}

/**
 * Applies the padding for the pane's state. In full screen, when which program runs decides it,
 * the programs are looked up first and the padding stays until they are known.
 */
function updateFullScreenPadding(session: GhosttySession): void {
  const rule = session.look?.fullScreen;
  if (
    session.alternateScreen &&
    session.fullScreenPrograms === null &&
    rule &&
    needsRunningPrograms(rule)
  ) {
    void lookUpFullScreenPrograms(session);
  }
  applyPadding(session);
}

/** Asks the backend what runs in the pane; a failed lookup knows of no program. */
async function lookUpFullScreenPrograms(session: GhosttySession): Promise<void> {
  const lookup = ++session.fullScreenLookup;
  let programs: readonly string[] = [];
  if (session.pty) {
    try {
      programs = await invoke<string[]>('pty_running_programs', { id: session.pty.id });
    } catch (error) {
      console.error('[lut] Ghostty pty_running_programs failed for leaf', session.leafId, error);
    }
  }
  if (session.fullScreenLookup !== lookup || session.disposed) return;
  session.fullScreenPrograms = programs;
  applyPadding(session);
}

/**
 * The pane's padding, or none while a full-screen program fills it, plus the room a bar keeps. A
 * full-screen program has no scrollback, so no scrollbar either: the grid takes its room too. While
 * the programs that decide the padding are looked up, both stay as they were, so the pane refits once.
 */
function applyPadding(session: GhosttySession, surface = session.surface): void {
  const look = session.look;
  const deciding =
    session.alternateScreen &&
    !!look &&
    needsRunningPrograms(look.fullScreen) &&
    session.fullScreenPrograms === null;
  surface?.setScrollbarGutter(!session.alternateScreen || deciding);
  const fills =
    session.alternateScreen &&
    !!session.look &&
    fillsFullScreen(session.look.fullScreen, session.fullScreenPrograms);
  const padding = fills ? NO_PADDING : (session.look?.padding ?? NO_PADDING);
  surface?.setPadding(
    session.barInset === 0 ? padding : { ...padding, bottom: padding.bottom + session.barInset },
  );
}

function attachGhosttySurface(session: GhosttySession, surface: GhosttySurface): void {
  if (!session.container) return;
  applyPadding(session, surface);
  surface.attach(session.container);
  surface.setVisible(true);
  surface.setFocused(session.focused);
  if (session.focused) focusSessionSurface(session, surface);
}

function createWebGlFallbackSurface(
  session: GhosttySession,
  generation: number,
  options: GhosttySurfaceBaseOptions,
  Surface: typeof WebGlTerminalSurface,
): WebGlTerminalSurface {
  const surface = new Surface({
    ...options,
    onError: (error) => {
      queueMicrotask(() => {
        if (!session.disposed && generation === session.generation && session.surface === surface) {
          reportRendererFailure(session, error);
        }
      });
    },
  });
  return surface;
}

async function fallbackWebGpuSurface(
  session: GhosttySession,
  generation: number,
  options: GhosttySurfaceBaseOptions,
  cause: Error,
): Promise<void> {
  const failedSurface = session.surface;
  if (
    session.disposed ||
    generation !== session.generation ||
    failedSurface?.backend !== 'ghostty-webgpu' ||
    !session.model
  ) {
    return;
  }

  try {
    if (!(await replaceGhosttySurface(session, generation, options))) return;
  } catch (error) {
    if (session.disposed || session.generation !== generation || session.surface !== failedSurface)
      return;
    reportRendererFailure(
      session,
      new Error(
        `WebGPU failed (${cause.message}); WebGL fallback failed (${toError(error).message})`,
      ),
    );
    return;
  }
  console.warn(
    '[lut] WebGPU renderer failed; preserved the live Ghostty model, PTY, and scrollback with WebGL:',
    cause.message,
  );
}

async function replaceGhosttySurface(
  session: GhosttySession,
  generation: number,
  options: GhosttySurfaceBaseOptions,
): Promise<GhosttySurface | null> {
  session.cancelFocusRetry?.();
  return loadSessionRenderer(
    session,
    generation,
    () => import('@/modules/terminal/ghostty/webgl/WebGlTerminalSurface'),
    (renderer) => {
      const currentOptions = session.surfaceOptions ?? options;
      const replacement = replaceSessionSurface(
        session,
        () =>
          createWebGlFallbackSurface(
            session,
            generation,
            currentOptions,
            renderer.WebGlTerminalSurface,
          ),
        (surface) => {
          if (session.visible && session.container) attachGhosttySurface(session, surface);
        },
        (surface) => createGhosttyInput(session, currentOptions.model, surface),
      );
      session.rendererError = null;
      session.callbacks.onError?.(sessionFailure(session));
      session.callbacks.onSearchReady?.(replacement.searchController());
      // The replacement is built with the last font that applied; one asked for since (one that
      // failed to apply) is tried on it.
      if (fontSpecKey(currentOptions.metrics.font) !== fontSpecKey(session.font)) {
        void updateSessionFont(session, session.font, true);
      }
      return replacement;
    },
  );
}

function reportRendererFailure(session: GhosttySession, error: Error): void {
  if (session.disposed) return;
  session.cancelFocusRetry?.();
  logSurfaceError(session.surface?.backend ?? session.backend, error);
  session.rendererError = error.message;
  session.surface?.setVisible(false);
  session.surface?.detach();
  session.callbacks.onError?.(sessionFailure(session));
}

async function retryGhosttyRenderer(session: GhosttySession): Promise<void> {
  if (session.disposed || !session.model || !session.surfaceOptions) return;
  const generation = session.generation;
  const failedSurface = session.surface;
  try {
    await replaceGhosttySurface(session, generation, session.surfaceOptions);
  } catch (error) {
    if (session.disposed || session.generation !== generation || session.surface !== failedSurface)
      return;
    reportRendererFailure(session, toError(error));
  }
}

function sessionFailure(session: GhosttySession): GhosttySessionFailure | null {
  if (session.startupError) return { kind: 'startup', ...session.startupError };
  if (session.rendererError) return { kind: 'renderer', message: session.rendererError };
  return null;
}

function logSurfaceError(backend: GhosttyBackend, error: Error): void {
  console.error(`[lut] ${backend} surface failed:`, error.message, error.stack ?? error);
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function createStartupTimings(): GhosttyStartupTimings {
  return {
    startedAt: performance.now(),
    fontsReadyMs: null,
    coreReadyMs: null,
    gpuReadyMs: null,
    modelReadyMs: null,
    surfaceReadyMs: null,
    ptyReadyMs: null,
    firstOutputMs: null,
    firstFrameMs: null,
    firstPromptMs: null,
  };
}

/**
 * Draws the pane's new font. `force` measures it again although it did not change: the global font
 * it may fall back to changed, or it was asked for before the surface existed. Only the latest
 * update applies; one that fails to apply shows the renderer error and its retry.
 */
async function updateSessionFont(
  session: GhosttySession,
  font: TerminalFontSpec,
  force = false,
): Promise<void> {
  if (fontSpecKey(session.font) === fontSpecKey(font) && !force) return;
  session.font = font;
  const revision = ++session.fontRevision;
  const surface = session.surface;
  if (!surface || session.disposed) return;
  const latest = () =>
    !session.disposed && session.surface === surface && session.fontRevision === revision;

  await ensureMonoFontsLoaded();
  await document.fonts.ready;
  await prepareHintedFonts(font.family, font.weight);
  const measured = await measureTerminalFont(font);
  if (!latest()) return;
  const metrics = await fontThatFits(session, measured, (wanted) => surface.fitsFont(wanted));
  if (!metrics || !latest()) return;
  try {
    surface.setFontMetrics(metrics);
  } catch (error) {
    reportRendererFailure(session, toError(error));
    return;
  }
  if (session.surfaceOptions) session.surfaceOptions = { ...session.surfaceOptions, metrics };
}

const warnedFonts = new Set<string>();

/**
 * `metrics` when the renderer has room for its glyphs; else the global font's, or `null` when that
 * one has no room either and the pane keeps the font it has. A WebGPU window draws up to 8 fonts at
 * once; the first time a font does not fit, a warning says so.
 */
async function fontThatFits(
  session: GhosttySession,
  metrics: TerminalFontMetrics,
  fits: (metrics: TerminalFontMetrics) => boolean,
): Promise<TerminalFontMetrics | null> {
  if (fits(metrics)) return metrics;
  const key = fontSpecKey(metrics.font);
  if (!warnedFonts.has(key)) {
    warnedFonts.add(key);
    toast.warning('Too many terminal fonts', {
      description: `${metrics.font.family} ${metrics.font.size}px is not shown: a window draws up to 8 terminal fonts at once.`,
    });
  }
  const fallback = session.look?.globalFont;
  if (!fallback || fontSpecKey(fallback) === key) return null;
  await prepareHintedFonts(fallback.family, fallback.weight);
  const global = await measureTerminalFont(fallback);
  return fits(global) ? global : null;
}

class BoundedPtyWriter {
  private readonly queue: Uint8Array[] = [];
  private pty: PtySession | null = null;
  private flushing = false;
  private disposed = false;
  pendingBytes = 0;

  constructor(private readonly onError: (error: unknown) => void) {}

  attach(pty: PtySession): void {
    if (this.disposed) return;
    this.pty = pty;
    void this.flush();
  }

  detach(): void {
    this.pty = null;
  }

  clear(): void {
    this.queue.length = 0;
    this.pendingBytes = 0;
  }

  enqueue(bytes: Uint8Array): boolean {
    if (
      this.disposed ||
      bytes.byteLength === 0 ||
      this.pendingBytes + bytes.byteLength > MAX_PENDING_INPUT_BYTES
    ) {
      return false;
    }
    this.queue.push(bytes);
    this.pendingBytes += bytes.byteLength;
    void this.flush();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    this.pty = null;
    this.queue.length = 0;
    this.pendingBytes = 0;
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.disposed || !this.pty) return;
    this.flushing = true;
    try {
      while (!this.disposed && this.pty && this.queue.length > 0) {
        const pty = this.pty;
        const batch = this.takeBatch();
        try {
          await pty.write(batch);
        } catch (error) {
          this.onError(error);
          return;
        }
      }
    } finally {
      this.flushing = false;
      if (!this.disposed && this.pty && this.queue.length > 0) {
        queueMicrotask(() => void this.flush());
      }
    }
  }

  private takeBatch(): Uint8Array {
    let length = 0;
    let count = 0;
    while (count < this.queue.length) {
      const nextLength = this.queue[count].byteLength;
      if (count > 0 && length + nextLength > MAX_WRITE_BATCH_BYTES) break;
      length += nextLength;
      count += 1;
      if (length >= MAX_WRITE_BATCH_BYTES) break;
    }

    if (count === 1) {
      const single = this.queue.shift();
      if (!single) return new Uint8Array(0);
      this.pendingBytes -= single.byteLength;
      return single;
    }
    const batch = new Uint8Array(length);
    let offset = 0;
    for (let index = 0; index < count; index += 1) {
      const chunk = this.queue[index];
      batch.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.queue.splice(0, count);
    this.pendingBytes -= length;
    return batch;
  }
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    for (const leafId of [...sessions.keys()]) disposeGhosttySession(leafId);
  });
}
