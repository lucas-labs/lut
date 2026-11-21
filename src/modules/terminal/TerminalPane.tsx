import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { type ProfileEntry, useCloseBehavior } from '@/modules/profiles';
import { usePreferencesStore } from '@/modules/settings/preferences';
import type { TerminalSearchController } from '@/modules/terminal/search/TerminalSearchController';
import {
  forwardRef,
  type KeyboardEvent,
  lazy,
  memo,
  Suspense,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { TerminalBackendKind } from './backend/contracts';
import { terminalBackendFor } from './backend/selection';
import { useGhosttyTerminalSession } from './ghostty/useGhosttyTerminalSession';
import type { LaunchError } from './lib/launchError';
import { usePaneLifecycle } from './lib/paneLifecycle';
import { usePaneAppearance } from './lib/usePaneAppearance';
import { PANE_BAR_HEIGHT, PaneExitBar, PaneLaunchBar } from './PaneStatusBar';

export type TerminalPaneHandle = {
  write: (data: string) => void;
  /** Like `write`, but only when the shell is at its prompt; false if not. */
  writeAtPrompt: (data: string) => Promise<boolean>;
  focus: () => void;
  getBuffer: (maxLines?: number) => string | null;
  getSelection: () => string | null;
};

export type TerminalPaneProps = {
  /** Stable identifier for this leaf (passed back through callbacks). */
  leafId: number;
  /** Tab containing this pane is on screen. */
  visible: boolean;
  /** This leaf is the active pane within its tab and receives auto-focus. */
  focused?: boolean;
  initialCwd?: string;
  /** The pane's terminal profile; none opens the default one. */
  profileId?: string;
  onSearchReady?: (leafId: number, addon: TerminalSearchController) => void;
  onExit?: (leafId: number, code: number) => void;
  onCwd?: (leafId: number, cwd: string) => void;
  /** The profile the pane's terminal opened with. */
  onProfile?: (leafId: number, profileId: string | undefined) => void;
};

/** The pane's profile itself cannot open: it is gone, or what it runs is missing. */
function profileCannotOpen(launch: LaunchError | undefined): boolean {
  return (
    launch?.code === 'profileNotFound' || launch?.code === 'distroNotInstalled' || launch?.code === 'executableNotFound'
  );
}

const TerminalAccessibleOutput = lazy(() => import('./ghostty/TerminalAccessibleOutput'));

const GhosttyTerminalPane = memo(
  forwardRef<
    TerminalPaneHandle,
    TerminalPaneProps & {
      backend: Extract<TerminalBackendKind, `ghostty-${string}`>;
    }
  >(function GhosttyTerminalPane(
    { leafId, visible, focused = true, initialCwd, profileId, onSearchReady, onExit, onCwd, onProfile, backend },
    ref,
  ) {
    const screenReader = usePreferencesStore((state) => state.terminalScreenReader);
    const closeBehavior = useCloseBehavior(profileId);
    const containerRef = useRef<HTMLDivElement>(null);
    const appearance = usePaneAppearance(profileId);
    const session = useGhosttyTerminalSession({
      leafId,
      backend,
      container: containerRef,
      visible,
      focused,
      initialCwd,
      profileId,
      appearance,
      onSearchReady: (search) => onSearchReady?.(leafId, search),
      onCwd: (cwd) => onCwd?.(leafId, cwd),
      onProfile: (id) => onProfile?.(leafId, id),
    });

    // Each exit is decided once, with the profile as it was when the process exited, or when the
    // profiles were first listed after that; a restart clears it.
    const [exitBehavior, setExitBehavior] = useState<ProfileEntry['closeBehavior'] | null>(null);
    if (session.exitCode === null && exitBehavior !== null) setExitBehavior(null);
    if (session.exitCode !== null && exitBehavior === null && closeBehavior !== null) {
      setExitBehavior(closeBehavior);
    }
    const closePane = useEffectEvent((code: number) => onExit?.(leafId, code));
    useEffect(() => {
      if (exitBehavior === 'close' && session.exitCode !== null) closePane(session.exitCode);
    }, [exitBehavior, session.exitCode]);

    const exitBar = session.exitCode !== null && (exitBehavior === 'ask' || exitBehavior === 'keepOpen');
    const launchBar = session.error?.kind === 'startup' && profileCannotOpen(session.error.launch);
    const showsBar = exitBar || launchBar;
    const { setBarInset } = session;
    useEffect(() => setBarInset(showsBar ? PANE_BAR_HEIGHT : 0), [showsBar, setBarInset]);

    // The exit bar's keys: Enter restarts, Esc closes; nothing else reaches the exited terminal anyway.
    const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
      if (!exitBar || exitBehavior !== 'ask' || session.exitCode === null) return;
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Enter') session.restart();
      else onExit?.(leafId, session.exitCode);
    };

    useImperativeHandle(
      ref,
      () => ({
        write: session.write,
        writeAtPrompt: session.writeAtPrompt,
        focus: session.focus,
        getBuffer: session.getBuffer,
        getSelection: session.getSelection,
      }),
      [session],
    );

    return (
      <div
        className="zoom-exempt relative h-full w-full overflow-hidden"
        style={{
          visibility: visible ? 'visible' : 'hidden',
          pointerEvents: visible ? 'auto' : 'none',
        }}
        data-terminal-backend={backend}
        onKeyDownCapture={onKeyDownCapture}
      >
        <div ref={containerRef} className={cn('absolute inset-0 transition-opacity', showsBar && 'opacity-55')} />
        {screenReader && session.model && (
          <Suspense fallback={null}>
            <TerminalAccessibleOutput
              model={session.model}
              visible={visible}
              focused={focused}
              onExit={session.focus}
            />
          </Suspense>
        )}
        {exitBar && session.exitCode !== null && (
          <PaneExitBar
            code={session.exitCode}
            ask={exitBehavior === 'ask'}
            onRestart={session.restart}
            onClose={() => onExit?.(leafId, session.exitCode ?? 0)}
          />
        )}
        {launchBar && session.error && (
          <PaneLaunchBar message={session.error.message} onRetry={session.retry} onOpenWith={session.openWithProfile} />
        )}
        {session.error && !launchBar && (
          <div
            role="alert"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background p-6 text-center text-sm"
          >
            <strong>
              {session.error.kind === 'renderer' ? 'Unable to display terminal' : 'Unable to start terminal'}
            </strong>
            <p className="max-w-md break-words text-muted-foreground">{session.error.message}</p>
            {session.error.kind === 'renderer' && (
              <p className="text-muted-foreground">Your terminal session is preserved. Retry to restore its display.</p>
            )}
            <Button variant="outline" onClick={session.retry}>
              {session.error.kind === 'renderer' ? 'Retry display' : 'Retry'}
            </Button>
          </div>
        )}
      </div>
    );
  }),
);

export const TerminalPane = memo(
  forwardRef<TerminalPaneHandle, TerminalPaneProps>(function TerminalPane(props, ref) {
    usePaneLifecycle(props.leafId);
    const [backend] = useState(() => terminalBackendFor(usePreferencesStore.getState().terminalRenderer));
    return <GhosttyTerminalPane ref={ref} {...props} backend={backend} />;
  }),
);
