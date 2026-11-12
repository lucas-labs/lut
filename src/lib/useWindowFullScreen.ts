import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useState } from 'react';

/** Whether the window is in OS full screen, kept current as the window resizes. */
export function useWindowFullScreen(): boolean {
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    let alive = true;
    let unlisten: (() => void) | undefined;
    const win = getCurrentWindow();
    const sync = () => {
      void win
        .isFullscreen()
        .then((value) => {
          if (alive) setFullScreen(value);
        })
        .catch(() => {});
    };
    sync();
    void win
      .onResized(sync)
      .then((stop) => {
        if (alive) unlisten = stop;
        else stop();
      })
      .catch(() => {});
    return () => {
      alive = false;
      unlisten?.();
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
