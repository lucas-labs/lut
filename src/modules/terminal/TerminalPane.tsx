import { Alert, AlertAction, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useProfiles } from '@/modules/profiles';
import { usePreferencesStore } from '@/modules/settings/preferences';
import type { TerminalSearchController } from '@/modules/terminal/search/TerminalSearchController';
import { useTheme } from '@/modules/theme';
import { forwardRef, lazy, memo, Suspense, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { TerminalBackendKind } from './backend/contracts';
import { terminalBackendFor } from './backend/selection';
import { useGhosttyTerminalSession } from './ghostty/useGhosttyTerminalSession';
import type { LaunchError } from './lib/launchError';
import { usePaneLifecycle } from './lib/paneLifecycle';

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
function opensWithDefaultProfile(launch: LaunchError | undefined): boolean {
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
    const profiles = useProfiles();
    // What the pane does when its process exits; a pane without a listed profile closes, as it always did.
    const closeBehavior = profiles?.profiles.find((profile) => profile.id === profileId)?.closeBehavior ?? 'close';
    const containerRef = useRef<HTMLDivElement>(null);
    const { resolvedMode, activeTheme } = useTheme();
    const session = useGhosttyTerminalSession({
      leafId,
      backend,
      container: containerRef,
      visible,
      focused,
      initialCwd,
      profileId,
      onSearchReady: (search) => onSearchReady?.(leafId, search),
      onExit: (code) => {
        if (closeBehavior === 'close') onExit?.(leafId, code);
      },
      onCwd: (cwd) => onCwd?.(leafId, cwd),
      onProfile: (id) => onProfile?.(leafId, id),
    });

    useEffect(() => {
      void resolvedMode;
      void activeTheme;
      const id = requestAnimationFrame(() => session.applyTheme());
      return () => cancelAnimationFrame(id);
    }, [resolvedMode, activeTheme, session]);

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
      >
        <div ref={containerRef} className="absolute inset-0" />
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
        {session.exitCode !== null && closeBehavior !== 'close' && (
          <div className="absolute inset-x-3 bottom-3 z-10">
            <Alert>
              <AlertTitle>Process exited with code {session.exitCode}</AlertTitle>
              {closeBehavior === 'ask' && (
                <AlertAction className="flex gap-2">
                  <Button variant="outline" onClick={() => onExit?.(leafId, session.exitCode ?? 0)}>
                    Close
                  </Button>
                  <Button variant="outline" onClick={session.restart}>
                    Restart
                  </Button>
                </AlertAction>
              )}
            </Alert>
          </div>
        )}
        {session.error && (
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
            <div className="flex gap-2">
              <Button variant="outline" onClick={session.retry}>
                {session.error.kind === 'renderer' ? 'Retry display' : 'Retry'}
              </Button>
              {opensWithDefaultProfile(session.error.launch) && (
                <Button variant="outline" onClick={session.openWithDefaultProfile}>
                  Open with default profile
                </Button>
              )}
            </div>
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
