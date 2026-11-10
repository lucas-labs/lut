import { useEffect } from 'react';

export type PaneLifecycleEvent = 'mount' | 'unmount';
type Listener = (event: PaneLifecycleEvent, leafId: number) => void;

let listener: Listener | null = null;

/**
 * Test-only instrumentation (IR-84): reports every TerminalPane mount and unmount, so shell changes can prove they
 * never remount terminals. No listener is set outside tests.
 */
export function setPaneLifecycleListener(next: Listener | null): void {
  listener = next;
}

export function usePaneLifecycle(leafId: number): void {
  useEffect(() => {
    listener?.('mount', leafId);
    return () => listener?.('unmount', leafId);
  }, [leafId]);
}
