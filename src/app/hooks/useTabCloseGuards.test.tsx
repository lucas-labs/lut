// @vitest-environment happy-dom
import { initialNavigationData, useNavigationStore } from '@/modules/navigation';
import { startSessionReconciler } from '@/modules/sessions';
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTabCloseGuards } from './useTabCloseGuards';

const fake = vi.hoisted(() => ({ busy: true, dispose: vi.fn() }));

vi.mock('@/modules/terminal/lib/terminalSessionApi', async (original) => ({
  ...(await original<typeof import('@/modules/terminal/lib/terminalSessionApi')>()),
  disposeSession: fake.dispose,
}));
vi.mock('@/modules/terminal', async (original) => ({
  ...(await original<typeof import('@/modules/terminal')>()),
  leafHasForegroundProcess: async () => fake.busy,
}));

type Guards = ReturnType<typeof useTabCloseGuards>;

const store = () => useNavigationStore.getState();
/** The hook's latest result, written after each render. */
const probe: { current: Guards | null } = { current: null };
const guards = () => {
  if (!probe.current) throw new Error('Harness not rendered');
  return probe.current;
};
let root: Root;
let host: HTMLElement;
let stop: () => void = () => {};

function Harness() {
  const tabs = useNavigationStore((s) => s.tabs);
  const activeId = useNavigationStore((s) => s.activeId);
  const result = useTabCloseGuards({
    tabs,
    activeId,
    disposeTab: (id) => store().closeTab(id),
    disposeTabs: (anchorId, plan) => store().closeTabs(anchorId, plan),
    disposeDeletedTabs: () => {},
  });
  useLayoutEffect(() => {
    probe.current = result;
  });
  return null;
}

beforeEach(async () => {
  useNavigationStore.setState(initialNavigationData());
  store().markBooted();
  stop = startSessionReconciler();
  fake.dispose.mockClear();
  fake.busy = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(Harness)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  stop();
});

describe('closing a terminal tab with a running process', () => {
  it('asks first, and disposes its sessions once on accept', async () => {
    const busyTab = store().newTab();
    const leaf = store().splitActivePane(busyTab, 'row');
    const leaves = [busyTab + 1, leaf];
    await act(async () => {});

    await act(async () => guards().handleClose(busyTab));
    expect(guards().pendingTerminalCloseTab).toBe(busyTab);
    expect(store().tabs.some((t) => t.id === busyTab)).toBe(true);
    expect(fake.dispose).not.toHaveBeenCalled();

    await act(async () => guards().confirmTerminalClose());
    expect(store().tabs.some((t) => t.id === busyTab)).toBe(false);
    expect(fake.dispose.mock.calls.map(([id]) => id).sort()).toEqual([...leaves].sort());
  });

  it('keeps the tab and its sessions when the user cancels', async () => {
    const busyTab = store().newTab();
    await act(async () => {});
    await act(async () => guards().handleClose(busyTab));
    await act(async () => guards().cancelTerminalClose());
    expect(store().tabs.some((t) => t.id === busyTab)).toBe(true);
    expect(fake.dispose).not.toHaveBeenCalled();
  });

  it('closes an idle terminal straight away', async () => {
    fake.busy = false;
    const idle = store().newTab();
    await act(async () => {});
    await act(async () => guards().handleClose(idle));
    expect(guards().pendingTerminalCloseTab).toBeNull();
    expect(store().tabs.some((t) => t.id === idle)).toBe(false);
    expect(fake.dispose).toHaveBeenCalledTimes(1);
  });
});
