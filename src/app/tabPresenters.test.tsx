// @vitest-environment happy-dom
import type { ProfileEntry, ProfilesList } from '@/modules/profiles';
import { IncognitoIcon, type LutIconComponent, ServerIcon, ShellCmdIcon, ShellPwshIcon } from '@lut/lut-icons';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const profiles = vi.hoisted(() => ({ list: null as ProfilesList | null }));
vi.mock('@/modules/profiles/store', () => ({ useProfiles: () => profiles.list }));

const { initialNavigationData, TabIcon, useNavigationStore } = await import('@/modules/navigation');
const { registerTabPresenters } = await import('./tabPresenters');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function profile(id: string, executable: string, icon?: string): ProfileEntry {
  return {
    id,
    name: id,
    executable,
    args: [],
    env: {},
    loadUserProfile: true,
    environment: { kind: 'native' },
    appearance: {},
    tab: { allowShellTitle: true, icon },
    closeBehavior: 'close',
    source: 'detected',
    hidden: false,
  };
}

const store = () => useNavigationStore.getState();
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  registerTabPresenters();
  useNavigationStore.setState(initialNavigationData());
  profiles.list = {
    profiles: [
      profile('detected:pwsh', 'pwsh.exe'),
      profile('detected:cmd', 'cmd.exe'),
      profile('custom:db', 'psql', 'server'),
    ],
    defaultProfileId: 'detected:pwsh',
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

/** An icon's drawing: the markup's styles serialize differently in the DOM. */
const drawing = (html: string) => [...html.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]).join(' ');
const icon = (Icon: LutIconComponent) => drawing(renderToStaticMarkup(createElement(Icon, { size: 'sm' })));
const shown = async (tabId: number) => {
  await act(async () => root.render(createElement(TabIcon, { id: tabId })));
  return drawing(host.innerHTML);
};

describe('a terminal tab icon', () => {
  it('is the icon of the profile its pane opened with', async () => {
    expect(await shown(store().newTab(undefined, 'custom:db'))).toBe(icon(ServerIcon));
  });

  it('is the default profile’s for a pane opened without a profile', async () => {
    expect(await shown(store().newTab())).toBe(icon(ShellPwshIcon));
  });

  it('follows the active pane', async () => {
    const tabId = store().newTab(undefined, 'detected:pwsh');
    const opened = store().tabs.find((t) => t.id === tabId);
    if (opened?.kind !== 'terminal') throw new Error('no terminal tab');
    store().splitActivePane(tabId, 'row', 'detected:cmd');
    expect(await shown(tabId)).toBe(icon(ShellCmdIcon));
    act(() => store().focusPane(tabId, opened.activeLeafId));
    expect(await shown(tabId)).toBe(icon(ShellPwshIcon));
  });

  it('stays the incognito icon for a private terminal', async () => {
    expect(await shown(store().newPrivateTab())).toBe(icon(IncognitoIcon));
  });
});
