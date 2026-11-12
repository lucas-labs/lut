import './styles/globals.css';

import { initLaunchDir, initWindowFrame, showHiddenWindow } from '@/modules/platform';
import { startSessionReconciler } from '@/modules/sessions';
import { terminalDiagnosticsEnabled } from '@/modules/terminal/lib/terminalDiagnosticsEnabled';
import { invoke } from '@tauri-apps/api/core';
import ReactDOM from 'react-dom/client';
import App from './app/App';

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

// Reap PTY sessions orphaned by a prior webview load before any tab spawns.
await invoke('pty_close_all').catch(() => {});

// Seed before first paint so default tab mounts at target cwd (no flicker).
await initLaunchDir();

// A terminal leaf that no tab holds any more has its session disposed.
startSessionReconciler();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<App />);

// The window starts hidden (tauri.conf.json) until React paints.
showHiddenWindow('window.show');

if (terminalDiagnosticsEnabled()) {
  void import('@/modules/terminal/lib/terminalDiagnostics').then((diagnostics) =>
    diagnostics.installTerminalDiagnostics(),
  );
}
