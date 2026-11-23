import type { EphemeralSpacePrefs } from '@/modules/settings/store';
import type { WorkspaceEnv } from '@/modules/workspace';
import type { SpaceMeta } from './store';

/**
 * The ephemeral Space (E16-15, decision 31): a Space like any other that is never saved. Each start creates it again
 * from its settings; nothing about it, not even that it exists, goes to `lut-spaces.json`.
 */
export const EPHEMERAL_SPACE_ID = 'ephemeral';

export function isEphemeralSpace(id: string | null | undefined): boolean {
  return id === EPHEMERAL_SPACE_ID;
}

/**
 * Where its terminal opens: the folder lut was opened with, else its folder setting. Null lets the default profile's
 * starting directory apply.
 */
export function ephemeralTabCwd(launchArgDir: string | null, folder: string): string | null {
  return launchArgDir ?? (folder.trim() || null);
}

export function ephemeralSpaceMeta(
  prefs: EphemeralSpacePrefs,
  env: WorkspaceEnv,
  root: string | null,
  now = Date.now(),
): SpaceMeta {
  return {
    id: EPHEMERAL_SPACE_ID,
    name: prefs.name,
    root,
    env,
    ...(prefs.color !== null && { color: prefs.color }),
    createdAt: now,
    updatedAt: now,
  };
}
