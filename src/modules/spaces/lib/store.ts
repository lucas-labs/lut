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
  /** The copy of the file kept before saving over the broken tabs; its path is empty when lut saves nothing. */
  brokenTabsCopy: RecoveredFile | null;
};

/** Set when saving would write over data lut could not use: a file left in place, or broken tabs without a copy. */
let writesBlocked = false;

/**
 * Reads the saved Spaces, validated (E16-03). An unusable file is moved aside and the defaults are loaded; one that
 * cannot be read is left in place, and nothing is saved this session. A file with broken tabs is copied aside first,
 * since the next save drops them.
 */
export async function loadAll(): Promise<SpacesLoad> {
  // Native checks the file before the store plugin opens it: the plugin ignores a file it cannot parse.
  const opened = await invoke<RecoveredFile | null>('spaces_store_open');
  if (opened && !opened.backupPath) writesBlocked = true;
  try {
    const { brokenTabs, ...data } = parseSpacesStore(await store.entries());
    return {
      data,
      recovered: opened,
      brokenTabs,
      brokenTabsCopy: await copyBrokenTabs(brokenTabs),
    };
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
      brokenTabsCopy: null,
    };
  }
}

/** Keeps a copy of the file before a save drops its broken tabs; without one, nothing is saved. */
async function copyBrokenTabs(brokenTabs: BrokenTab[]): Promise<RecoveredFile | null> {
  if (brokenTabs.length === 0) return null;
  const copy = await invoke<RecoveredFile>('spaces_store_copy_aside', {
    reason: `${brokenTabs.length} saved ${brokenTabs.length === 1 ? 'tab' : 'tabs'} could not be restored`,
  });
  if (!copy.backupPath) writesBlocked = true;
  return copy;
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
