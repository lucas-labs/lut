import { useEffect, useState } from 'react';
import { isWindowFullScreen, onWindowResized } from './window';

/** Whether the window is in OS full screen, kept current as the window resizes. */
export function useWindowFullScreen(): boolean {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    let alive = true;
    const sync = () => {
      void isWindowFullScreen()
        .then((value) => {
          if (alive) setFullScreen(value);
        })
        .catch(() => {});
    };
    sync();
    const stop = onWindowResized(sync);
    return () => {
      alive = false;
      stop();
    };
  }, []);

  return fullScreen;
}

/**
 * The value of `data-tauri-drag-region` for the window's drag areas: a full-screen window is neither dragged nor
 * maximized by a double click there ("false" switches Tauri's drag handling off for that element).
 */
export function dragRegion(fullScreen: boolean): '' | 'false' {
  return fullScreen ? 'false' : '';
}
