import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A promise and the functions that settle it. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const win = vi.hoisted(() => ({
  calls: [] as string[],
  listening: null as null | {
    listener: (event: unknown) => void;
    started: ReturnType<typeof deferred<() => void>>;
  },
  show: vi.fn<() => Promise<void>>(),
}));
const os = vi.hoisted(() => ({ windows: true }));

vi.mock('./os', () => ({
  get IS_WINDOWS() {
    return os.windows;
  },
}));

/** Records an `on…` listener and returns a start the test settles. */
function listen(listener: (event: unknown) => void) {
  const started = deferred<() => void>();
  win.listening = { listener, started };
  return started.promise;
}

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    show: () => {
      win.calls.push('show');
      return win.show();
    },
    setFocus: async () => {
      win.calls.push('setFocus');
    },
    onResized: listen,
    onFocusChanged: listen,
    setFullscreen: async (on: boolean) => {
      win.calls.push(`setFullscreen(${on})`);
    },
    setResizable: async (on: boolean) => {
      win.calls.push(`setResizable(${on})`);
    },
  }),
}));

const {
  bringWindowToFront,
  onWindowFocusChanged,
  onWindowResized,
  setWindowFullScreen,
  showHiddenWindow,
} = await import('./window');

/** Lets pending promises run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  win.calls = [];
  win.listening = null;
  win.show.mockReset().mockResolvedValue(undefined);
  os.windows = true;
});

afterEach(() => vi.useRealTimers());

describe('window subscriptions', () => {
  it('stops a listener that has started', async () => {
    const unlisten = vi.fn();
    const stop = onWindowResized(() => {});
    win.listening?.started.resolve(unlisten);
    await flush();
    expect(unlisten).not.toHaveBeenCalled();
    stop();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('stops a listener as soon as it starts when stopped before', async () => {
    const unlisten = vi.fn();
    const stop = onWindowResized(() => {});
    stop();
    win.listening?.started.resolve(unlisten);
    await flush();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it('logs a listener that fails to start', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stop = onWindowResized(() => {});
    win.listening?.started.reject(new Error('no window'));
    await flush();
    expect(warn).toHaveBeenCalledOnce();
    expect(() => stop()).not.toThrow();
    warn.mockRestore();
  });

  it('passes whether the window has the focus', () => {
    const focused: boolean[] = [];
    onWindowFocusChanged((value) => focused.push(value));
    win.listening?.listener({ payload: false });
    win.listening?.listener({ payload: true });
    expect(focused).toEqual([false, true]);
  });
});

describe('showHiddenWindow', () => {
  it('shows the window after 50 ms and again after 500 ms', () => {
    vi.useFakeTimers();
    showHiddenWindow('window.show');
    vi.advanceTimersByTime(49);
    expect(win.calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(win.calls).toEqual(['show']);
    vi.advanceTimersByTime(450);
    expect(win.calls).toEqual(['show', 'show']);
  });

  it('logs a failed show under the given name', async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('hidden');
    win.show.mockRejectedValue(failure);
    showHiddenWindow('settings show');
    await vi.advanceTimersByTimeAsync(50);
    expect(error).toHaveBeenCalledWith('settings show failed:', failure);
    error.mockRestore();
  });
});

describe('bringWindowToFront', () => {
  it('shows the window, then focuses it', async () => {
    await bringWindowToFront();
    expect(win.calls).toEqual(['show', 'setFocus']);
  });
});

describe('full screen', () => {
  it('makes the window not resizable while it is full screen on Windows, so no resize strip covers its top', async () => {
    await setWindowFullScreen(true);
    expect(win.calls).toEqual(['setResizable(false)', 'setFullscreen(true)']);
    win.calls = [];
    await setWindowFullScreen(false);
    expect(win.calls).toEqual(['setFullscreen(false)', 'setResizable(true)']);
  });

  it('only toggles full screen elsewhere', async () => {
    os.windows = false;
    await setWindowFullScreen(true);
    await setWindowFullScreen(false);
    expect(win.calls).toEqual(['setFullscreen(true)', 'setFullscreen(false)']);
  });
});
