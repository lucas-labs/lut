// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from 'zustand';

const fake = vi.hoisted(() => ({
  dev: false,
  status: null as { status: string; version: string | null; error: string | null } | null,
  requestUpdateCheck: vi.fn(async () => {}),
  setUpdatesEnabled: vi.fn(async (_value: unknown) => {}),
  setUpdateChannel: vi.fn(async (_value: unknown) => {}),
}));

vi.mock('@/modules/platform', () => ({ isDevBuild: async () => fake.dev }));
vi.mock('@/modules/settings/preferences', () => ({
  usePreferencesStore: create(() => ({ updatesEnabled: true, updateChannel: null as string | null })),
}));
vi.mock('@/modules/settings/store', () => ({
  setUpdatesEnabled: fake.setUpdatesEnabled,
  setUpdateChannel: fake.setUpdateChannel,
}));
vi.mock('@/modules/updates', async () => ({
  requestUpdateCheck: fake.requestUpdateCheck,
  resolveChannel: (await import('@/modules/updates/schedule')).resolveChannel,
  useUpdateStatus: () => fake.status,
}));

const { usePreferencesStore } = await import('@/modules/settings/preferences');
const { UpdatesGroup } = await import('./UpdatesGroup');

let host: HTMLDivElement;
let root: Root;

async function render(version = '0.10.0') {
  await act(async () => {
    root.render(createElement(UpdatesGroup, { version }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const text = () => host.textContent ?? '';
const checkNow = () =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Check now')) as HTMLButtonElement;
const updatesSwitch = () => host.querySelector('[role="switch"]') as HTMLButtonElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  fake.dev = false;
  fake.status = null;
  fake.requestUpdateCheck.mockClear();
  fake.setUpdatesEnabled.mockClear();
  usePreferencesStore.setState({ updatesEnabled: true, updateChannel: null });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('UpdatesGroup', () => {
  it('shows the installed version channel until one is chosen', async () => {
    await render('0.11.0-beta.1');
    expect(text()).toContain('Beta');
    usePreferencesStore.setState({ updateChannel: 'stable' });
    await render('0.11.0-beta.1');
    expect(text()).toContain('Stable');
  });

  it('asks the main window to check, and shows what it answers', async () => {
    fake.status = { status: 'available', version: '0.10.1', error: null };
    await render();
    expect(text()).toContain('lut 0.10.1 is available');
    act(() => checkNow().click());
    expect(fake.requestUpdateCheck).toHaveBeenCalled();
  });

  it('turns updates off, and then cannot check', async () => {
    await render();
    act(() => updatesSwitch().click());
    expect(fake.setUpdatesEnabled).toHaveBeenCalledWith(false);
    usePreferencesStore.setState({ updatesEnabled: false });
    await render();
    expect(text()).toContain('lut makes no update requests.');
    expect(checkNow().disabled).toBe(true);
  });

  it('shows a failed check', async () => {
    fake.status = { status: 'error', version: null, error: 'offline' };
    await render();
    expect(text()).toContain("Couldn't check: offline");
  });

  it('disables everything in a development build', async () => {
    fake.dev = true;
    await render();
    expect(text()).toContain("Development builds don't update.");
    expect(checkNow().disabled).toBe(true);
    expect(updatesSwitch().disabled).toBe(true);
  });
});
