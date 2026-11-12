// @vitest-environment happy-dom
import type { AgentLaunchRequest } from '@/modules/agents';
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A promise and the function that settles it. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const fake = vi.hoisted(() => ({
  invoke: vi.fn<(command: string, args: unknown) => Promise<void>>(),
  sessions: new Map<number, { promise: Promise<void>; resolve: () => void }>(),
  written: [] as [number, string][],
  closed: new Set<number>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: fake.invoke }));
vi.mock('@/modules/terminal', () => ({
  whenSessionReady: (leafId: number) => fake.sessions.get(leafId)?.promise ?? Promise.resolve(),
  writeToSession: (leafId: number, data: string) => {
    if (fake.closed.has(leafId)) return false;
    fake.written.push([leafId, data]);
    return true;
  },
}));

const { useAgentLaunch } = await import('./useAgentLaunch');

type Launch = ReturnType<typeof useAgentLaunch>;
const probe: { current: Launch | null } = { current: null };
const launch = (request: AgentLaunchRequest) => {
  if (!probe.current) throw new Error('not rendered');
  probe.current(request);
};

let root: Root;
let newAgentGroupTab: ReturnType<
  typeof vi.fn<(cwd: string | undefined, title: string, instances: number) => { leafIds: number[] }>
>;

function Host() {
  const result = useAgentLaunch({ inheritedCwdForNewTab: () => '/work', newAgentGroupTab });
  useLayoutEffect(() => {
    probe.current = result;
  });
  return null;
}

/** Lets the launch promises run. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fake.invoke.mockReset().mockResolvedValue(undefined);
  fake.sessions.clear();
  fake.written = [];
  fake.closed.clear();
  newAgentGroupTab = vi.fn((_cwd, _title, instances) => ({
    leafIds: Array.from({ length: instances }, (_, i) => 100 + i),
  }));
  root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Host)));
});

afterEach(() => {
  act(() => root.unmount());
  vi.restoreAllMocks();
});

describe('useAgentLaunch', () => {
  it('opens nothing for an invalid command', async () => {
    launch({ agent: 'claude', command: 'claude\nrm -rf /', instances: 1 });
    await settle();
    expect(newAgentGroupTab).not.toHaveBeenCalled();
    expect(fake.invoke).not.toHaveBeenCalled();
    expect(fake.written).toEqual([]);
  });

  it('starts the agent once its session is ready and its notifications are set up', async () => {
    const session = deferred();
    const hooks = deferred();
    fake.sessions.set(100, session);
    fake.invoke.mockReturnValue(hooks.promise);

    launch({ agent: 'claude', command: 'claude', instances: 1 });
    expect(newAgentGroupTab).toHaveBeenCalledWith('/work', 'Claude', 1);
    expect(fake.invoke).toHaveBeenCalledWith('agent_enable_hooks', { agent: 'claude' });

    session.resolve();
    await settle();
    expect(fake.written).toEqual([]);

    hooks.resolve();
    await settle();
    expect(fake.written).toEqual([[100, 'claude\r']]);
  });

  it('names a group by its size and starts the agent in every terminal', async () => {
    launch({ agent: 'claude', command: 'claude', instances: 3 });
    await settle();
    expect(newAgentGroupTab).toHaveBeenCalledWith('/work', 'Claude × 3', 3);
    expect(fake.written).toEqual([
      [100, 'claude\r'],
      [101, 'claude\r'],
      [102, 'claude\r'],
    ]);
  });

  it('skips the notification setup for an agent without hooks', async () => {
    launch({ agent: 'opencode', command: 'opencode', instances: 1 });
    await settle();
    expect(fake.invoke).not.toHaveBeenCalled();
    expect(fake.written).toEqual([[100, 'opencode\r']]);
  });

  it('still starts the agent when its notifications cannot be set up', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fake.invoke.mockRejectedValue(new Error('no settings file'));
    launch({ agent: 'claude', command: 'claude', instances: 1 });
    await settle();
    expect(warn).toHaveBeenCalledOnce();
    expect(fake.written).toEqual([[100, 'claude\r']]);
  });

  it('reports a terminal closed before the agent could start', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    fake.closed.add(100);
    launch({ agent: 'claude', command: 'claude', instances: 1 });
    await settle();
    expect(fake.written).toEqual([]);
    expect(error).toHaveBeenCalledWith('[lut] agent terminal 100 closed before launch');
  });
});
