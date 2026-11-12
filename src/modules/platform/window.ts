import { type CloseRequestedEvent, getCurrentWindow } from '@tauri-apps/api/window';

/** Stops a window subscription. */
export type Unsubscribe = () => void;

/**
 * Starts a Tauri window listener, which resolves later, and returns a function that stops it: called before the
 * listener resolved, it stops it as soon as it does. A listener that fails to start is logged.
 */
function subscribe(listen: () => Promise<Unsubscribe>): Unsubscribe {
  let stopped = false;
  let stop: Unsubscribe | undefined;
  listen()
    .then((unlisten) => {
      if (stopped) unlisten();
      else stop = unlisten;
    })
    .catch((error) => console.warn('[lut] could not listen to the window:', error));
  return () => {
    stopped = true;
    stop?.();
  };
}

/**
 * Shows this window, which starts hidden so the user never sees a transparent frame before React paints, once after
 * 50 ms and again after 500 ms in case the first one did not take. `setTimeout`, because `requestAnimationFrame`
 * does not run while the window is hidden. Failures are logged as `<name> failed`.
 */
export function showHiddenWindow(name: string): void {
  const show = () => {
    getCurrentWindow()
      .show()
      .catch((e) => console.error(`${name} failed:`, e));
  };
  setTimeout(show, 50);
  setTimeout(show, 500);
}

/** Closes this window, as its close button does: listeners of `onWindowCloseRequested` can stop it. */
export function closeWindow(): Promise<void> {
  return getCurrentWindow().close();
}

export function minimizeWindow(): Promise<void> {
  return getCurrentWindow().minimize();
}

export function toggleMaximizeWindow(): Promise<void> {
  return getCurrentWindow().toggleMaximize();
}

export function isWindowMaximized(): Promise<boolean> {
  return getCurrentWindow().isMaximized();
}

export function isWindowFullScreen(): Promise<boolean> {
  return getCurrentWindow().isFullscreen();
}

export function setWindowFullScreen(on: boolean): Promise<void> {
  return getCurrentWindow().setFullscreen(on);
}

export function setWindowTitle(title: string): Promise<void> {
  return getCurrentWindow().setTitle(title);
}

/** Shows this window and gives it the keyboard focus. */
export async function bringWindowToFront(): Promise<void> {
  const window = getCurrentWindow();
  await window.show();
  await window.setFocus();
}

export function onWindowResized(listener: () => void): Unsubscribe {
  return subscribe(() => getCurrentWindow().onResized(listener));
}

export function onWindowFocusChanged(listener: (focused: boolean) => void): Unsubscribe {
  return subscribe(() => getCurrentWindow().onFocusChanged(({ payload }) => listener(payload)));
}

/** Runs `listener` when the user or `closeWindow` asks to close this window; `event.preventDefault()` keeps it open. */
export function onWindowCloseRequested(
  listener: (event: CloseRequestedEvent) => void | Promise<void>,
): Unsubscribe {
  return subscribe(() => getCurrentWindow().onCloseRequested(listener));
}
