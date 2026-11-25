// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

const fake = vi.hoisted(() => ({ check: vi.fn(), clear: vi.fn() }));

vi.mock('@/modules/settings/preferences', () => ({
  usePreferencesStore: create(() => ({
    settled: false,
    updatesEnabled: true,
    updateChannel: null as 'stable' | 'beta' | null,
  })),
}));
vi.mock('./updateStore', () => ({
  clearLastCheck: fake.clear,
  useUpdateStore: { getState: () => ({ checkForUpdates: fake.check }) },
}));

const { usePreferencesStore } = await import('@/modules/settings/preferences');
const { CHECK_TICK_MS, FIRST_CHECK_DELAY_MS, useUpdateChecks } = await import('./useUpdateChecks');

function Host() {
  useUpdateChecks();
  return null;
}

let root: Root;
const prefs = (state: Record<string, unknown>) => act(() => usePreferencesStore.setState(state));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  fake.check.mockReset();
  fake.clear.mockReset();
  usePreferencesStore.setState({ settled: false, updatesEnabled: true, updateChannel: null });
  root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Host)));
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe('useUpdateChecks', () => {
  it('waits for the saved settings, then checks after start and on every tick', () => {
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS);
    expect(fake.check).not.toHaveBeenCalled();
    prefs({ settled: true });
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS);
    expect(fake.check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CHECK_TICK_MS);
    expect(fake.check).toHaveBeenCalledTimes(2);
  });

  it('runs no timer while updates are off', () => {
    prefs({ settled: true, updatesEnabled: false });
    vi.advanceTimersByTime(CHECK_TICK_MS * 3);
    expect(fake.check).not.toHaveBeenCalled();
  });

  it('checks soon after the channel changes', () => {
    prefs({ settled: true, updateChannel: 'stable' });
    expect(fake.clear).not.toHaveBeenCalled();
    prefs({ updateChannel: 'beta' });
    expect(fake.clear).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS);
    expect(fake.check).toHaveBeenCalledTimes(1);
  });
});
