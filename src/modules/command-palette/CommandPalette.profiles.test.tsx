// @vitest-environment happy-dom
import type { ProfileEntry, ProfilesList } from '@/modules/profiles';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PaletteInitialMode, PaletteItem } from './types';

const profiles = vi.hoisted(() => ({
  list: null as ProfilesList | null,
  read: 'listed' as 'reading' | 'failed' | 'listed',
  readAgain: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: () => Promise.resolve([]) }));
vi.mock('@/modules/profiles/store', () => ({
  useProfiles: () => profiles.list,
  useProfilesRead: () => profiles.read,
  readProfilesAgain: profiles.readAgain,
  useCloseBehavior: () => 'close',
  useProfileAppearance: () => undefined,
  setDefaultProfile: () => Promise.resolve(),
}));
vi.mock('@/modules/theme', () => ({
  listBuiltinThemes: () => [],
  useTheme: () => ({ themeId: 'lut', customThemes: [], setThemeId: () => {}, previewThemeId: () => {} }),
}));

const { CommandPalette } = await import('./CommandPalette');

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

const COMMANDS: PaletteItem[] = [
  { id: 'tab.newWithProfile', title: 'New tab with profile...', group: 'Tabs', run: () => {} },
];

let host: HTMLDivElement;
let root: Root;
const onOpenProfile = vi.fn();

beforeAll(() => {
  // cmdk scrolls the selected row into view; happy-dom has no layout.
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  profiles.list = {
    profiles: [
      profile('detected:cmd', 'Command Prompt'),
      profile('detected:pwsh', 'PowerShell 7'),
      profile('x', 'Hidden', true),
    ],
    defaultProfileId: 'detected:pwsh',
  };
  profiles.read = 'listed';
  profiles.readAgain.mockClear();
  onOpenProfile.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (initialMode: PaletteInitialMode) =>
  act(async () =>
    root.render(
      createElement(CommandPalette, {
        open: true,
        onOpenChange: () => {},
        initialMode,
        commandItems: COMMANDS,
        workspaceRoot: null,
        onOpenContentHit: () => {},
        onOpenFile: () => {},
        onOpenProfile,
      }),
    ),
  );

/** Lets the palette run what it defers to after it closes. */
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

const rows = () => [...document.querySelectorAll('[cmdk-item]')].map((el) => el.textContent ?? '');
const input = () => document.querySelector('[cmdk-input]') as HTMLInputElement;

async function type(text: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input(), text);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function pressEnter() {
  await act(async () => {
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  await settle();
}

describe('the palette profiles page', () => {
  it('opens on the profiles, the default first, hidden ones left out', async () => {
    await render('profiles');
    expect(input().placeholder).toBe('Search profiles...');
    expect(rows()).toEqual(['PowerShell 7Default', 'Command Prompt', 'Back']);
  });

  it('opens a tab with the default profile on Enter', async () => {
    await render('profiles');
    await pressEnter();
    expect(onOpenProfile).toHaveBeenCalledWith('detected:pwsh');
  });

  it('filters the profiles and opens a tab with the best match on Enter', async () => {
    await render('profiles');
    await type('comm');
    expect(rows()).toEqual(['Command Prompt', 'Back']);
    await pressEnter();
    expect(onOpenProfile).toHaveBeenCalledWith('detected:cmd');
  });

  it('opens a tab with the profile clicked', async () => {
    await render('profiles');
    await act(async () =>
      (document.querySelector('[cmdk-item][data-value="profile:detected:cmd"]') as HTMLElement).click(),
    );
    await settle();
    expect(onOpenProfile).toHaveBeenCalledWith('detected:cmd');
  });

  it('reaches the profiles from its command', async () => {
    await render('commands');
    expect(rows()).toEqual(['New tab with profile...']);
    await pressEnter();
    expect(rows()).toEqual(['PowerShell 7Default', 'Command Prompt', 'Back']);
  });

  it('tells when the profiles could not be read, and reads them again', async () => {
    profiles.list = null;
    profiles.read = 'failed';
    await render('profiles');
    expect(profiles.readAgain).toHaveBeenCalledTimes(1);
    expect(rows()).toEqual(['Could not read profiles', 'Try again', 'Back']);
    await pressEnter();
    expect(profiles.readAgain).toHaveBeenCalledTimes(2);
  });

  it('tells while the profiles are being read', async () => {
    profiles.list = null;
    profiles.read = 'reading';
    await render('profiles');
    expect(rows()).toEqual(['Loading profiles...', 'Back']);
  });
});
