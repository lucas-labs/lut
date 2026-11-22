import type { ProfileEntry, ProfilesList } from './model';

/**
 * The profiles a picker offers, in its order: the default first, then the others not hidden, in
 * the listed order. The default is offered even when hidden, since it is what a new tab opens.
 */
export function visibleProfiles(list: ProfilesList): ProfileEntry[] {
  const fallback = list.profiles.find((profile) => profile.id === list.defaultProfileId);
  const others = list.profiles.filter((profile) => !profile.hidden && profile !== fallback);
  return fallback ? [fallback, ...others] : others;
}

/** A list read that offers at least one profile; with every profile hidden and no default, none. */
export function offersProfiles(list: ProfilesList | null): list is ProfilesList {
  return list !== null && visibleProfiles(list).length > 0;
}

/**
 * Whether the shell of a pane opened with `profileId` (none: the default profile) may name its tab. Only a listed
 * profile that allows it does: before the list is read, a title the user turned off never shows.
 */
export function allowsShellTitle(
  list: ProfilesList | null,
  profileId: string | undefined,
): boolean {
  if (list === null) return false;
  const id = profileId ?? list.defaultProfileId;
  return list.profiles.find((profile) => profile.id === id)?.tab.allowShellTitle ?? false;
}
