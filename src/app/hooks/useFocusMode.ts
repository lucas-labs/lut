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
  // Whether the window was full screen when focus mode began; leaving waits for the answer.
  const wasFullScreenRef = useRef<Promise<boolean>>(Promise.resolve(false));

  const toggleFocusMode = useCallback(() => {
    const entering = !activeRef.current;
    activeRef.current = entering;
    setFocusMode(entering);
    if (entering) {
      const wasFullScreen = isFullScreen().catch((error: unknown) => {
        logWindowError('reading full screen')(error);
        return true; // unknown: leave the window alone
      });
      wasFullScreenRef.current = wasFullScreen;
      void wasFullScreen
        .then((was) => {
          // Left again before the answer came back: the window stays as it is.
          if (!was && activeRef.current) return setFullScreen(true);
        })
        .catch(logWindowError('entering full screen'));
    } else {
      void wasFullScreenRef.current
        .then((was) => {
          if (!was) return setFullScreen(false);
        })
        .catch(logWindowError('leaving full screen'));
    }
  }, []);

  const toggleFullScreen = useCallback(() => {
    void isFullScreen()
      .then((fullScreen) => setFullScreen(!fullScreen))
      .catch(logWindowError('toggling full screen'));
  }, []);

  return { focusMode, toggleFocusMode, toggleFullScreen };
}
