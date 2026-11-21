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
