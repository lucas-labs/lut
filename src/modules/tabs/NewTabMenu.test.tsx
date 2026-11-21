// @vitest-environment happy-dom
import type { ProfileEntry, ProfilesList } from '@/modules/profiles';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewTabMenuActions } from './NewTabMenu';

const profiles = vi.hoisted(() => ({ list: null as ProfilesList | null }));
vi.mock('@/modules/profiles/store', () => ({
  useProfiles: () => profiles.list,
  useCloseBehavior: () => 'close',
  useProfileAppearance: () => undefined,
  setDefaultProfile: () => Promise.resolve(),
}));

const { NewTabMenu } = await import('./NewTabMenu');

function profile(id: string, name: string, hidden = false): ProfileEntry {
  return {
    id,
    name,
    args: [],
    env: {},
    loadUserProfile: true,
    environment: { kind: 'native' },
    appearance: {},
    tab: { allowShellTitle: true },
    closeBehavior: 'close',
    source: 'detected',
    hidden,
  };
}

const LIST: ProfilesList = {
  profiles: [
    profile('detected:cmd', 'Command Prompt'),
    profile('detected:pwsh', 'PowerShell 7'),
    profile('detected:hidden', 'Hidden', true),
    profile('detected:wsl:Ubuntu', 'Ubuntu'),
  ],
  defaultProfileId: 'detected:pwsh',
};

let host: HTMLDivElement;
let root: Root;
let actions: { [K in keyof NewTabMenuActions]: NewTabMenuActions[K] };

beforeEach(() => {
  profiles.list = LIST;
  actions = {
    onNew: vi.fn(),
    onNewWithProfile: vi.fn(),
    onSplit: vi.fn(),
    canSplit: true,
    onNewPrivate: vi.fn(),
    onNewPreview: vi.fn(),
    onNewEditor: vi.fn(),
    onNewGitGraph: vi.fn(),
    onLaunchAgents: vi.fn(),
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function openMenu(patch: Partial<NewTabMenuActions> = {}) {
  await act(async () => root.render(createElement(NewTabMenu, { size: 'strip', ...actions, ...patch })));
  const trigger = host.querySelector('[aria-label="New tab"]');
  if (!trigger) throw new Error('no trigger');
  await act(async () => {
    trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
  });
}

/** The open menus' items, by their text; the newest menu last. */
const menus = () => [...document.querySelectorAll('[role="menu"]')];
const itemsOf = (menu: Element) =>
  [...menu.querySelectorAll(':scope [role="menuitem"]')].filter((el) => el.closest('[role="menu"]') === menu);
const itemNamed = (menu: Element, name: string) => {
  const item = itemsOf(menu).find((el) => el.textContent?.includes(name));
  if (!item) throw new Error(`no item "${name}"`);
  return item as HTMLElement;
};

describe('NewTabMenu', () => {
  it('lists the profiles to open a tab with, the default first and tagged, hidden ones left out', async () => {
    await openMenu();
    const [menu] = menus();
    expect(menu.textContent).toContain('New tab');
    const names = itemsOf(menu).map((el) => el.textContent ?? '');
    expect(names.slice(0, 3).map((n) => n.replace(/Default.*/, ''))).toEqual([
      'PowerShell 7',
      'Command Prompt',
      'Ubuntu',
    ]);
    expect(names[0]).toContain('Default');
    expect(names.some((n) => n.includes('Hidden'))).toBe(false);
  });

  it('opens a tab with the chosen profile', async () => {
    await openMenu();
    await act(async () => itemNamed(menus()[0], 'Ubuntu').click());
    expect(actions.onNewWithProfile).toHaveBeenCalledWith('detected:wsl:Ubuntu');
  });

  it('offers one terminal with the default profile until the profiles are listed', async () => {
    profiles.list = null;
    await openMenu();
    await act(async () => itemNamed(menus()[0], 'Terminal').click());
    expect(actions.onNew).toHaveBeenCalled();
  });

  it('offers one terminal when every profile is hidden and none is default', async () => {
    profiles.list = { profiles: [profile('detected:cmd', 'Command Prompt', true)], defaultProfileId: null };
    await openMenu();
    expect(itemsOf(menus()[0]).some((el) => el.textContent?.includes('Command Prompt'))).toBe(false);
    await act(async () => itemNamed(menus()[0], 'Terminal').click());
    expect(actions.onNew).toHaveBeenCalled();
  });

  it('splits with the profile chosen in the split submenu', async () => {
    await openMenu();
    await act(async () => itemNamed(menus()[0], 'Split down').click());
    const sub = menus()[menus().length - 1];
    if (!sub || sub === menus()[0]) throw new Error('no submenu');
    await act(async () => itemNamed(sub, 'Command Prompt').click());
    expect(actions.onSplit).toHaveBeenCalledWith('col', 'detected:cmd');
  });

  it('disables the splits when the active tab cannot take another pane', async () => {
    await openMenu({ canSplit: false });
    for (const name of ['Split right', 'Split down']) {
      expect(itemNamed(menus()[0], name).hasAttribute('data-disabled')).toBe(true);
    }
  });
});
