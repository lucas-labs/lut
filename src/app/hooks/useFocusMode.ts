import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useRef, useState } from 'react';

const isFullScreen = () => getCurrentWindow().isFullscreen();
const setFullScreen = (on: boolean) => getCurrentWindow().setFullscreen(on);

function logWindowError(action: string) {
  return (error: unknown) => console.error(`[focus mode] ${action} failed`, error);
}

/**
 * Focus mode (E12-10, §10.4): only the terminal area shows, in OS full screen. The chrome's own state (sidebar,
 * tab column, orientation) is never touched, so leaving shows it exactly as it was. Leaving also leaves full screen,
 * unless the window was already full screen on the way in.
 *
 * `toggleFullScreen` is the separate full-screen toggle (F11), with or without focus mode.
 */
export function useFocusMode() {
  const [focusMode, setFocusMode] = useState(false);
  // The source of truth for the toggles: two presses before React re-renders must still alternate.
  const activeRef = useRef(false);
  // Whether focus mode put the window in full screen, so leaving takes it out again.
  const enteredFullScreenRef = useRef(false);
  // F11 is an ordering boundary: a later exit must not cancel entry across it.
  const fullScreenToggleRef = useRef(0);
  // Window changes run one after another, each reading the window as the previous one left it.
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const enqueue = useCallback((action: string, change: () => Promise<unknown>) => {
    queueRef.current = queueRef.current.then(change).then(() => {}, logWindowError(action));
  }, []);

  const toggleFocusMode = useCallback(() => {
    const entering = !activeRef.current;
    activeRef.current = entering;
    setFocusMode(entering);
    const fullScreenToggle = fullScreenToggleRef.current;
    const entryCancelled = () =>
      !activeRef.current && fullScreenToggleRef.current === fullScreenToggle;
    enqueue(entering ? 'entering full screen' : 'leaving full screen', async () => {
      if (entering) {
        // A quick entry/exit pair can cancel only when no F11 separates them.
        if (entryCancelled()) return;
        const alreadyFullScreen = await isFullScreen();
        if (alreadyFullScreen || entryCancelled()) return;
        await setFullScreen(true);
        enteredFullScreenRef.current = true;
      } else if (enteredFullScreenRef.current) {
        enteredFullScreenRef.current = false;
        await setFullScreen(false);
      }
    });
  }, [enqueue]);

  const toggleFullScreen = useCallback(() => {
    fullScreenToggleRef.current += 1;
    enqueue('toggling full screen', async () => setFullScreen(!(await isFullScreen())));
  }, [enqueue]);

  return { focusMode, toggleFocusMode, toggleFullScreen };
}
