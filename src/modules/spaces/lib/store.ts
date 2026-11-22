import { ShapeError } from '@/lib/shape';
import type { WorkspaceEnv } from '@/modules/workspace';
import { invoke } from '@tauri-apps/api/core';
import { LazyStore } from '@tauri-apps/plugin-store';
import { ACTIVE_KEY, type BrokenTab, parseSpacesStore, SPACES_KEY, stateKey } from './parse';
import type { SerializedTab } from './serialize';

export type SpaceMeta = {
  id: string;
  name: string;
  root: string | null;
  env: WorkspaceEnv;
  /** Opt-in accent, index into SPACE_COLORS. Undefined = theme primary. */
  color?: number;
  createdAt: number;
  updatedAt: number;
};

export type SpaceState = {
  tabs: SerializedTab[];
  activeTabIndex: number;
};

const STORE_PATH = 'lut-spaces.json';

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 500 });

export type LoadedSpaces = {
  spaces: SpaceMeta[];
  activeId: string | null;
  states: Map<string, SpaceState>;
};

/** A store file lut could not use, so it started with the defaults. */
export type RecoveredFile = {
  /** Where the file was moved; empty when it was left in place, and lut does not save Spaces. */
  backupPath: string;
  reason: string;
};

export type SpacesLoad = {
  data: LoadedSpaces;
  recovered: RecoveredFile | null;
  brokenTabs: BrokenTab[];
};

/** Set when the store file was left in place, unusable: saving would write over it. */
let writesBlocked = false;

/**
 * Reads the saved Spaces, validated (E16-03). An unusable file is moved aside and the defaults are loaded; one that
 * cannot be read is left in place, and nothing is saved this session.
 */
export async function loadAll(): Promise<SpacesLoad> {
  // Native checks the file before the store plugin opens it: the plugin ignores a file it cannot parse.
  const opened = await invoke<RecoveredFile | null>('spaces_store_open');
  if (opened && !opened.backupPath) writesBlocked = true;
  try {
    const { brokenTabs, ...data } = parseSpacesStore(await store.entries());
    return { data, recovered: opened, brokenTabs };
  } catch (error) {
    if (!(error instanceof ShapeError)) throw error;
    const recovered = await invoke<RecoveredFile>('spaces_store_move_aside', {
      reason: error.message,
    });
    if (recovered.backupPath) {
      await store.clear();
      await store.save();
    } else {
      writesBlocked = true;
    }
    return {
      data: { spaces: [], activeId: null, states: new Map() },
      recovered,
      brokenTabs: [],
    };
  }
}

export async function saveSpacesList(spaces: SpaceMeta[]): Promise<void> {
  if (!writesBlocked) await store.set(SPACES_KEY, spaces);
}

export async function saveActiveId(id: string | null): Promise<void> {
  if (!writesBlocked) await store.set(ACTIVE_KEY, id);
}

export async function saveState(id: string, state: SpaceState): Promise<void> {
  if (!writesBlocked) await store.set(stateKey(id), state);
}

export async function deleteSpaceData(id: string): Promise<void> {
  if (!writesBlocked) await store.delete(stateKey(id));
}

export function newSpaceId(): string {
  return `sp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
