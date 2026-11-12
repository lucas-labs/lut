// @vitest-environment happy-dom
import type { WorkspaceEnv } from '@/modules/workspace';
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

/** A promise the test settles by hand. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const fake = vi.hoisted(() => ({
  localHome: null as null | { promise: Promise<string>; resolve: (value: string) => void },
  wslHome: null as null | { promise: Promise<string>; resolve: (value: string) => void },
  setEnv: vi.fn(),
  authorize: vi.fn(async (_path: string) => {}),
}));

vi.mock('@tauri-apps/api/path', () => ({
  homeDir: () => fake.localHome?.promise ?? Promise.resolve('C:\\Users\\me'),
}));
vi.mock('@/modules/workspace', () => ({
  LOCAL_WORKSPACE: { kind: 'local' },
  getWslHome: () => fake.wslHome?.promise,
  workspaceNative: {
    workspaceAuthorize: fake.authorize,
    workspaceCurrentDir: async () => 'C:/launch',
  },
}));

const { useWorkspaceSwitcher } = await import('./useWorkspaceSwitcher');

type Switcher = ReturnType<typeof useWorkspaceSwitcher>;
const probe: { current: Switcher | null } = { current: null };
/** The switcher as last rendered. */
const switcher = () => {
  if (!probe.current) throw new Error('not rendered');
  return probe.current;
};

function Host() {
  const result = useWorkspaceSwitcher({ setWorkspaceEnv: fake.setEnv });
  useLayoutEffect(() => {
    probe.current = result;
  });
  return null;
}

const WSL: WorkspaceEnv = { kind: 'wsl', distro: 'Ubuntu' };
const LOCAL: WorkspaceEnv = { kind: 'local' };
let root: Root;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fake.localHome = null;
  fake.wslHome = null;
  fake.setEnv.mockClear();
  fake.authorize.mockClear();
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(createElement(Host)));
});

afterEach(() => {
  act(() => root.unmount());
});

it("keeps the latest space's home when an earlier switch resolves last", async () => {
  const wslHome = deferred<string>();
  const localHome = deferred<string>();
  fake.wslHome = wslHome;
  fake.localHome = localHome;
  let wslAdoption!: Promise<string | null>;
  let localAdoption!: Promise<string | null>;
  act(() => {
    wslAdoption = switcher().adoptWorkspaceEnv(WSL);
    localAdoption = switcher().adoptWorkspaceEnv(LOCAL);
  });

  await act(async () => {
    localHome.resolve('C:\\Users\\me');
    await localAdoption;
  });
  await act(async () => {
    wslHome.resolve('/home/me');
    await wslAdoption;
  });

  expect(fake.setEnv).toHaveBeenLastCalledWith({ kind: 'local' });
  expect(switcher().home).toBe('C:/Users/me');
  expect(switcher().launchCwd).toBe('C:/Users/me');
  expect(fake.authorize).not.toHaveBeenCalledWith('/home/me');
});

it("adopts a space's home when nothing newer started", async () => {
  const wslHome = deferred<string>();
  fake.wslHome = wslHome;
  let adoption!: Promise<string | null>;
  act(() => {
    adoption = switcher().adoptWorkspaceEnv(WSL);
  });
  await act(async () => {
    wslHome.resolve('/home/me');
    await adoption;
  });

  expect(await adoption).toBe('/home/me');
  expect(switcher().home).toBe('/home/me');
  expect(fake.authorize).toHaveBeenCalledWith('/home/me');
});
