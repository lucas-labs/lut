import { IS_WINDOWS, USE_CUSTOM_WINDOW_CONTROLS } from './os';
import { isWindowFullScreen, isWindowMaximized, onWindowResized } from './window';

/** Set on `<html>` while the window is maximized or full screen. */
const WINDOW_MAXIMIZED_ATTR = 'data-window-maximized';

/**
 * Decides who draws the window's corners and border.
 * - Windows: the system. The borderless window keeps its native frame shadow (`shadow` in
 *   tauri.windows.conf.json), so Windows 11 rounds it, clips Mica to the rounding and squares it
 *   when maximized; Windows 10 draws square corners, as for every window there.
 * - Linux: lut. The window is a transparent rectangle, so `data-chrome="borderless"` paints rounded
 *   corners and a border, dropped while the window is maximized or full screen.
 * - macOS: the system, around its native title bar.
 */
export function initWindowFrame(root: HTMLElement = document.documentElement): void {
  if (!USE_CUSTOM_WINDOW_CONTROLS || IS_WINDOWS) return;
  root.dataset.chrome = 'borderless';
  const sync = () => {
    void Promise.all([isWindowMaximized(), isWindowFullScreen()])
      .then(([maximized, fullscreen]) =>
        root.toggleAttribute(WINDOW_MAXIMIZED_ATTR, maximized || fullscreen),
      )
      .catch(() => {});
  };
  sync();
  onWindowResized(sync);
}
