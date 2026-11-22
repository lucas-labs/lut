import { ShapeError, shapeReaders } from '@/lib/shape';
import { MAX_PANES_PER_TAB, type SplitDir } from '@/modules/terminal/lib/panes';
import type { WorkspaceEnv } from '@/modules/workspace';
import type { SerializedNode, SerializedTab } from './serialize';
import type { LoadedSpaces, SpaceMeta, SpaceState } from './store';

/**
 * Reads the Spaces store back (E16-03): the Space list, the active Space and each listed Space's saved state. A broken
 * tab is skipped and reported, and the rest of its Space is restored; anything else that does not match makes the
 * whole file unusable, with a `ShapeError` naming the field.
 */

const { fail, dict, text, flag, count, optional, oneOf, list } = shapeReaders('saved Spaces data');

/** A saved tab that could not be restored. */
export type BrokenTab = {
  spaceId: string;
  /** Its position among the Space's saved tabs, from 0. */
  index: number;
  reason: string;
};

export type ParsedSpaces = LoadedSpaces & { brokenTabs: BrokenTab[] };

/** The store's keys: the Space list, the active Space, and each Space's saved state. */
export const SPACES_KEY = 'spaces';
export const ACTIVE_KEY = 'activeId';
export const stateKey = (id: string) => `state:${id}`;

const splitDir = oneOf<SplitDir>(['row', 'col']);

function node(value: unknown, path: string): SerializedNode {
  const raw = dict(value, path);
  switch (raw.kind) {
    case 'leaf':
      return {
        kind: 'leaf',
        cwd: optional(raw.cwd, `${path}.cwd`, text),
        profileId: optional(raw.profileId, `${path}.profileId`, text),
        active: optional(raw.active, `${path}.active`, flag),
      };
    case 'split':
      return {
        kind: 'split',
        dir: splitDir(raw.dir, `${path}.dir`),
        children: list(node)(raw.children, `${path}.children`),
        ratios: optional(raw.ratios, `${path}.ratios`, list(count)),
      };
    default:
      return fail(`${path}.kind`);
  }
}

/** The panes the tree restores to: a split without children comes back as one pane. */
function paneCount(tree: SerializedNode): number {
  if (tree.kind === 'leaf' || tree.children.length === 0) return 1;
  return tree.children.reduce((sum, c) => sum + paneCount(c), 0);
}

function tabOfKind(raw: Record<string, unknown>, path: string): SerializedTab {
  switch (raw.kind) {
    case 'terminal':
      return {
        kind: 'terminal',
        tree: node(raw.tree, `${path}.tree`),
        customTitle: optional(raw.customTitle, `${path}.customTitle`, text),
      };
    case 'editor':
    case 'markdown':
      return { kind: raw.kind, path: text(raw.path, `${path}.path`) };
    case 'preview':
      return { kind: 'preview', url: text(raw.url, `${path}.url`) };
    default:
      return fail(`${path}.kind`);
  }
}

/** One saved tab, or why it cannot be restored. */
function tab(value: unknown, path: string): SerializedTab | string {
  try {
    const raw = dict(value, path);
    const saved = tabOfKind(raw, path);
    const color = optional(raw.color, `${path}.color`, text);
    if (saved.kind === 'terminal') {
      const panes = paneCount(saved.tree);
      if (panes > MAX_PANES_PER_TAB) return `${panes} panes, more than ${MAX_PANES_PER_TAB}`;
    }
    return color === undefined ? saved : { ...saved, color };
  } catch (error) {
    if (error instanceof ShapeError) return error.message;
    throw error;
  }
}

function state(value: unknown, path: string, spaceId: string, broken: BrokenTab[]): SpaceState {
  const raw = dict(value, path);
  if (!Array.isArray(raw.tabs)) return fail(`${path}.tabs`);
  const savedActive = count(raw.activeTabIndex, `${path}.activeTabIndex`);
  const tabs: SerializedTab[] = [];
  let activeTabIndex = 0;
  raw.tabs.forEach((entry, index) => {
    const read = tab(entry, `${path}.tabs[${index}]`);
    if (typeof read === 'string') {
      broken.push({ spaceId, index, reason: read });
      return;
    }
    if (index < savedActive) activeTabIndex += 1;
    tabs.push(read);
  });
  // The saved index counts skipped tabs too: it moves to the active tab's new place, or to the tab that took it.
  return { tabs, activeTabIndex: Math.min(activeTabIndex, Math.max(tabs.length - 1, 0)) };
}

function workspaceEnv(value: unknown, path: string): WorkspaceEnv {
  const raw = dict(value, path);
  if (raw.kind === 'local') return { kind: 'local' };
  if (raw.kind === 'wsl') return { kind: 'wsl', distro: text(raw.distro, `${path}.distro`) };
  return fail(`${path}.kind`);
}

function space(value: unknown, path: string): SpaceMeta {
  const raw = dict(value, path);
  const color = optional(raw.color, `${path}.color`, count);
  return {
    id: text(raw.id, `${path}.id`),
    name: text(raw.name, `${path}.name`),
    root: raw.root === null ? null : text(raw.root, `${path}.root`),
    env: workspaceEnv(raw.env, `${path}.env`),
    ...(color !== undefined && { color }),
    createdAt: count(raw.createdAt, `${path}.createdAt`),
    updatedAt: count(raw.updatedAt, `${path}.updatedAt`),
  };
}

/**
 * Reads the store's entries. Keys it does not know, and the state of a Space no longer listed, are ignored. Throws a
 * `ShapeError` when the file is unusable.
 */
export function parseSpacesStore(entries: Iterable<[string, unknown]>): ParsedSpaces {
  const byKey = new Map(entries);
  const spaces = optional(byKey.get(SPACES_KEY), SPACES_KEY, list(space)) ?? [];
  const ids = new Set<string>();
  spaces.forEach(({ id }, index) => {
    if (ids.has(id)) fail(`spaces[${index}].id`);
    ids.add(id);
  });
  const rawActive = byKey.get(ACTIVE_KEY);
  const activeId =
    rawActive === undefined || rawActive === null ? null : text(rawActive, ACTIVE_KEY);
  const states = new Map<string, SpaceState>();
  const brokenTabs: BrokenTab[] = [];
  for (const { id } of spaces) {
    const key = stateKey(id);
    const saved = byKey.get(key);
    if (saved !== undefined) states.set(id, state(saved, key, id, brokenTabs));
  }
  return { spaces, activeId, states, brokenTabs };
}
