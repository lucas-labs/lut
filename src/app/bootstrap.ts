import { initLaunchDir, initWindowFrame, showHiddenWindow } from '@/modules/platform';
import { startSessionReconciler } from '@/modules/sessions';
import { terminalDiagnosticsEnabled } from '@/modules/terminal/lib/terminalDiagnosticsEnabled';
import { invoke } from '@tauri-apps/api/core';

/**
 * Starts the main window, in an order that matters (E09-07):
 * 1. the window frame, the opt-in dev overlay and the benchmark flags, before anything renders or reads them;
 * 2. `pty_close_all`, which ends the sessions a previous load of the page left running, before any tab spawns one;
 * 3. the launch directory, before the first paint, so the first tab mounts there and does not move;
 * 4. the session reconciler, which disposes the session of a pane that no tab holds any more;
 * 5. `render`, then the window, which starts hidden (tauri.conf.json) until React paints;
 * 6. the terminal diagnostics, when enabled.
 */
export async function bootstrap(render: () => void): Promise<void> {
  initWindowFrame();

  // Render-instrumentation overlay, opt-in: `VITE_REACT_SCAN=true pnpm dev`.
  // Dev-only dynamic import so it never reaches the production bundle.
  if (import.meta.env.DEV && import.meta.env.VITE_REACT_SCAN === 'true') {
    const { scan } = await import('react-scan');
    scan({ enabled: true });
  }

  // Real-application benchmark (scripts/app-lab): scenario flags must be in force before any
  // terminal module reads them. Removed entirely unless the build sets LUT_BENCH=1.
  if (__LUT_BENCH__) {
    const { installBenchEarly } = await import('@/bench/early');
    await installBenchEarly();
  }

  await invoke('pty_close_all').catch(() => {});
  await initLaunchDir();
  startSessionReconciler();

  render();
  showHiddenWindow('window.show');

  if (terminalDiagnosticsEnabled()) {
    void import('@/modules/terminal/lib/terminalDiagnostics').then((diagnostics) =>
      diagnostics.installTerminalDiagnostics(),
    );
  }
}
