export function terminalDiagnosticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.DEV) return true;
  try {
    return window.localStorage.getItem('lut:terminal-diagnostics') === '1';
  } catch {
    return false;
  }
}
