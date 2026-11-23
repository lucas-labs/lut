import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  saved: [] as {
    id: string;
    name: string;
    root: string | null;
    env: { kind: 'local' };
    createdAt: number;
    updatedAt: number;
  }[],
  states: new Map<string, { tabs: unknown[]; activeTabIndex: number }>(),
  launchArgDir: undefined as string | undefined,
  prefs: {
    init: async () => undefined,
    defaultWorkspaceEnv: 'local',
    ephemeralSpace: { enabled: true, name: 'Scratch', color: null as number | null, folder: '' },
  },
  savedLists: [] as unknown[],
}));

vi.mock('./store', () => ({
  loadAll: async () => ({
    data: { spaces: fake.saved, activeId: fake.saved[0]?.id ?? null, states: fake.states },
    recovered: null,
    brokenTabs: [],
    brokenTabsCopy: null,
  }),
  saveSpacesList: async (spaces: unknown) => void fake.savedLists.push(spaces),
  saveActiveId: async () => undefined,
  deleteSpaceData: async () => undefined,
  newSpaceId: () => 'sp-new',
}));
vi.mock('./loadNotice', () => ({ reportSpacesLoad: () => undefined }));
vi.mock('@/modules/platform', () => ({ getLaunchArgDir: () => fake.launchArgDir }));
vi.mock('@/modules/settings/preferences', () => ({
  usePreferencesStore: { getState: () => fake.prefs },
}));
vi.mock('@/modules/workspace', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/workspace')>()),
  workspaceNative: { workspaceAuthorize: async () => undefined },
}));

const { bootSpaces } = await import('./useSpacesBoot');
const { useSpaces } = await import('./useSpaces');
const { initialNavigationData, useNavigationStore } = await import('@/modules/navigation');

const savedSpace = (id: string) => ({
  id,
  name: id,
  root: null,
  env: { kind: 'local' as const },
  createdAt: 1,
  updatedAt: 1,
});
const savedTerminal = (cwd: string) => ({
  kind: 'terminal',
  title: 'shell',
  cwd,
  tree: { kind: 'leaf', cwd },
});

async function boot() {
  await bootSpaces({ launchCwd: '/launch', home: '/home', adoptWorkspaceEnv: async () => '/home' });
  const nav = useNavigationStore.getState();
  return {
    spaces: useSpaces.getState(),
    tabs: nav.tabs,
    activeTab: nav.tabs.find((t) => t.id === nav.activeId),
  };
}

beforeEach(() => {
  fake.saved = [];
  fake.states = new Map();
  fake.launchArgDir = undefined;
  fake.prefs.ephemeralSpace = { enabled: true, name: 'Scratch', color: null, folder: '' };
  fake.savedLists = [];
  useSpaces.setState({ spaces: [], activeId: null, hydrated: false, initialActiveIndex: {} });
  useNavigationStore.setState(initialNavigationData());
});

describe('booting with the ephemeral Space on (E16-15)', () => {
  it('creates only the ephemeral Space, active, with one terminal, and no "Default"', async () => {
    const { spaces, tabs, activeTab } = await boot();
    expect(spaces.spaces.map((s) => [s.id, s.name])).toEqual([['ephemeral', 'Scratch']]);
    expect(spaces.activeId).toBe('ephemeral');
    expect(tabs).toHaveLength(1);
    expect(activeTab?.spaceId).toBe('ephemeral');
    expect(fake.savedLists).toEqual([]);
  });

  it('puts it first and active, before the restored Spaces', async () => {
    fake.saved = [savedSpace('a')];
    fake.states.set('a', { tabs: [savedTerminal('C:/a')], activeTabIndex: 0 });
    const { spaces, tabs, activeTab } = await boot();
    expect(spaces.spaces.map((s) => s.id)).toEqual(['ephemeral', 'a']);
    expect(spaces.activeId).toBe('ephemeral');
    expect(tabs.map((t) => t.spaceId)).toEqual(['ephemeral', 'a']);
    expect(activeTab?.spaceId).toBe('ephemeral');
  });

  it('opens its terminal in the launch folder, else its folder setting, else none (the profile one)', async () => {
    fake.prefs.ephemeralSpace.folder = 'C:/setting';
    fake.launchArgDir = 'C:/launch';
    expect((await boot()).activeTab).toMatchObject({ cwd: 'C:/launch' });

    useNavigationStore.setState(initialNavigationData());
    fake.launchArgDir = undefined;
    expect((await boot()).activeTab).toMatchObject({ cwd: 'C:/setting' });

    useNavigationStore.setState(initialNavigationData());
    fake.prefs.ephemeralSpace.folder = '';
    expect((await boot()).activeTab).toMatchObject({ cwd: undefined });
  });
});

describe('booting with the ephemeral Space off', () => {
  it('creates "Default" when nothing is saved', async () => {
    fake.prefs.ephemeralSpace.enabled = false;
    const { spaces } = await boot();
    expect(spaces.spaces.map((s) => s.name)).toEqual(['Default']);
    expect(fake.savedLists).toHaveLength(1);
  });

  it('restores the saved Spaces without it', async () => {
    fake.prefs.ephemeralSpace.enabled = false;
    fake.saved = [savedSpace('a')];
    fake.states.set('a', { tabs: [savedTerminal('C:/a')], activeTabIndex: 0 });
    const { spaces, activeTab } = await boot();
    expect(spaces.spaces.map((s) => s.id)).toEqual(['a']);
    expect(activeTab?.spaceId).toBe('a');
  });
});
