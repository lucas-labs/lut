// @vitest-environment happy-dom
import { initialNavigationData, type Tab, useNavigationStore } from '@/modules/navigation';
import { useSpaces } from '@/modules/spaces';
import type { WorkspaceEnv } from '@/modules/workspace';
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  adopt: vi.fn<(env: WorkspaceEnv) => Promise<string | null>>(),
  nextSpace: 0,
}));

vi.mock('@/modules/terminal/lib/terminalSessionApi', () => ({ disposeSession: vi.fn() }));
vi.mock('@/modules/spaces/lib/store', () => ({
  newSpaceId: () => `new-${++fake.nextSpace}`,
  saveSpacesList: vi.fn(async () => {}),
  saveActiveId: vi.fn(async () => {}),
  deleteSpaceData: vi.fn(async () => {}),
}));
vi.mock('@/modules/spaces', async () => ({
  useSpaces: (await import('@/modules/spaces/lib/useSpaces')).useSpaces,
  useSpacesBoot: () => {},
  useSpacePersistence: () => {},
}));
vi.mock('./useWorkspaceSwitcher', () => ({
  useWorkspaceSwitcher: () => ({
    home: '/home',
    launchCwd: '/home',
    launchCwdResolved: true,
    adoptWorkspaceEnv: fake.adopt,
  }),
}));

const { useWorkspaceCoordinator } = await import('./useWorkspaceCoordinator');

type Coordinator = ReturnType<typeof useWorkspaceCoordinator>;
const probe: { current: Coordinator | null } = { current: null };
/** The coordinator as last rendered. */
const coordinator = () => {
  if (!probe.current) throw new Error('not rendered');
  return probe.current;
};

const WSL: WorkspaceEnv = { kind: 'wsl', distro: 'Ubuntu' };
const nav = () => useNavigationStore.getState();
const spaceIds = () => useSpaces.getState().spaces.map((s) => s.id);
const activeSpace = () => useSpaces.getState().activeId;
const tabsIn = (spaceId: string) => nav().tabs.filter((t) => t.spaceId === spaceId);
const last = <T,>(items: T[]) => items[items.length - 1];

/** A cold terminal tab whose leaf id is its id + 1. */
function terminal(id: number, spaceId: string): Tab {
  return {
    id,
    kind: 'terminal',
    spaceId,
    cold: true,
    title: 'shell',
    paneTree: { kind: 'leaf', id: id + 1 },
    activeLeafId: id + 1,
  };
}

let root: Root;

function Host({ activeCwd }: { activeCwd: string | null }) {
  const result = useWorkspaceCoordinator({ activeCwd });
  useLayoutEffect(() => {
    probe.current = result;
  });
  return null;
}

function render(activeCwd: string | null = '/work') {
  act(() => root.render(createElement(Host, { activeCwd })));
}

/**
 * Spaces `a` (root /a) and `b` (root /b, WSL), `a` active; tab 1 in `a`, tabs 3 and 5 in `b`, tab 1 active.
 */
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fake.adopt.mockReset().mockResolvedValue(null);
  fake.nextSpace = 0;
  const space = (id: string, root: string, env: WorkspaceEnv) => ({
    id,
    name: id.toUpperCase(),
    root,
    env,
    createdAt: 0,
    updatedAt: 0,
  });
  useSpaces.getState().hydrate([space('a', '/a', { kind: 'local' }), space('b', '/b', WSL)], 'a');
  useNavigationStore.setState({
    ...initialNavigationData(),
    tabs: [terminal(1, 'a'), terminal(3, 'b'), terminal(5, 'b')],
    activeId: 1,
    nextId: 7,
    activeSpaceId: 'a',
    booted: true,
  });
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
  probe.current = null;
});

describe('useWorkspaceCoordinator', () => {
  it('follows a space switch with its environment and its last tab', () => {
    render();
    expect(fake.adopt).not.toHaveBeenCalled();
    act(() => coordinator().switchSpace('b'));
    expect(fake.adopt).toHaveBeenCalledExactlyOnceWith(WSL);
    expect(nav().activeId).toBe(5);
    expect(nav().activeSpaceId).toBe('b');
  });

  it('keeps the tab a jump activated in the space it switched to', () => {
    render();
    act(() => coordinator().jumpToTab(3));
    expect(activeSpace()).toBe('b');
    expect(nav().activeId).toBe(3);
  });

  it('opens a new space at the active directory, with the current environment and a tab', () => {
    render('/work');
    act(() => void coordinator().newSpace());
    const created = last(useSpaces.getState().spaces);
    expect(created).toMatchObject({ id: 'new-1', name: 'Space 3', root: '/work', env: { kind: 'local' } });
    expect(activeSpace()).toBe('new-1');
    const [tab] = tabsIn('new-1');
    expect(tab).toMatchObject({ kind: 'terminal', cwd: '/work' });
    expect(nav().activeId).toBe(tab.id);
  });

  it('roots a new space at home when there is no active directory', () => {
    render(null);
    act(() => void coordinator().newSpace());
    expect(last(useSpaces.getState().spaces)?.root).toBe('/home');
    expect(tabsIn('new-1')[0]).toMatchObject({ cwd: undefined });
  });

  it('deletes a space with its tabs and moves to the next one', () => {
    render();
    act(() => coordinator().deleteSpace('a'));
    expect(spaceIds()).toEqual(['b']);
    expect(activeSpace()).toBe('b');
    expect(tabsIn('a')).toEqual([]);
    expect(tabsIn('b').map((t) => t.id)).toEqual([3, 5]);
  });

  it('opens a tab at a space root without leaving the active one', () => {
    render();
    act(() => coordinator().newTabInSpace('b'));
    expect(last(tabsIn('b'))).toMatchObject({ cold: true, cwd: '/b' });
    expect(nav().activeId).toBe(1);
    expect(activeSpace()).toBe('a');
  });

  it('follows a moved tab only when it was active and emptied its space', () => {
    render();
    act(() => coordinator().moveTabToSpace(3, 'a'));
    expect(activeSpace()).toBe('a');
    act(() => coordinator().moveTabToSpace(1, 'b'));
    expect(activeSpace()).toBe('a');
    expect(nav().activeId).toBe(3);
    act(() => coordinator().moveTabToSpace(3, 'b'));
    expect(activeSpace()).toBe('b');
  });

  it('follows a reordered tab into the target space when it emptied its own', () => {
    render();
    act(() => coordinator().reorderTab(1, 3, 'bottom'));
    expect(activeSpace()).toBe('b');
    expect(tabsIn('b').map((t) => t.id)).toEqual([3, 1, 5]);
    expect(nav().activeId).toBe(1);
  });

  it('cycles spaces in order and wraps around', () => {
    render();
    act(() => coordinator().cycleSpace(-1));
    expect(activeSpace()).toBe('b');
    act(() => coordinator().cycleSpace(1));
    expect(activeSpace()).toBe('a');
    act(() => coordinator().deleteSpace('b'));
    act(() => coordinator().cycleSpace(1));
    expect(activeSpace()).toBe('a');
  });
});
