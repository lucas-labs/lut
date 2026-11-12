import { beforeEach, describe, expect, it, vi } from 'vitest';

/** A promise and the functions that settle it. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const boot = vi.hoisted(() => ({
  steps: [] as string[],
  closeAll: null as null | Promise<void>,
  launchDir: null as null | Promise<void>,
  diagnostics: true,
}));

vi.mock('@/modules/platform', () => ({
  initWindowFrame: () => boot.steps.push('window frame'),
  initLaunchDir: async () => {
    boot.steps.push('launch dir');
    await boot.launchDir;
    boot.steps.push('launch dir resolved');
  },
  showHiddenWindow: (name: string) => boot.steps.push(`show ${name}`),
}));
vi.mock('@/modules/sessions', () => ({
  startSessionReconciler: () => boot.steps.push('session reconciler'),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string) => {
    boot.steps.push(command);
    await boot.closeAll;
    boot.steps.push(`${command} resolved`);
  },
}));
vi.mock('@/modules/terminal/lib/terminalDiagnosticsEnabled', () => ({
  terminalDiagnosticsEnabled: () => boot.diagnostics,
}));
vi.mock('@/modules/terminal/lib/terminalDiagnostics', () => ({
  installTerminalDiagnostics: () => boot.steps.push('diagnostics'),
}));

const { bootstrap } = await import('./bootstrap');

const render = () => boot.steps.push('render');

/** Lets pending promises and dynamic imports run. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  boot.steps = [];
  boot.closeAll = null;
  boot.launchDir = null;
  boot.diagnostics = true;
});

describe('bootstrap', () => {
  it('starts the main window in order', async () => {
    await bootstrap(render);
    await flush();
    expect(boot.steps).toEqual([
      'window frame',
      'pty_close_all',
      'pty_close_all resolved',
      'launch dir',
      'launch dir resolved',
      'session reconciler',
      'render',
      'show window.show',
      'diagnostics',
    ]);
  });

  it('waits for the old sessions to close, then for the launch directory, before rendering', async () => {
    const closeAll = deferred();
    const launchDir = deferred();
    boot.closeAll = closeAll.promise;
    boot.launchDir = launchDir.promise;
    const done = bootstrap(render);
    await flush();
    expect(boot.steps).toEqual(['window frame', 'pty_close_all']);
    closeAll.resolve();
    await flush();
    expect(boot.steps[boot.steps.length - 1]).toBe('launch dir');
    launchDir.resolve();
    await done;
    expect(boot.steps).toContain('render');
  });

  it('starts even when the old sessions could not be closed', async () => {
    const closeAll = deferred();
    boot.closeAll = closeAll.promise;
    closeAll.reject(new Error('no backend'));
    await bootstrap(render);
    expect(boot.steps).toEqual([
      'window frame',
      'pty_close_all',
      'launch dir',
      'launch dir resolved',
      'session reconciler',
      'render',
      'show window.show',
    ]);
  });

  it('leaves the terminal diagnostics out unless enabled', async () => {
    boot.diagnostics = false;
    await bootstrap(render);
    await flush();
    expect(boot.steps).not.toContain('diagnostics');
  });
});
