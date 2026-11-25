import type { UpdateChannel } from '@/modules/settings/store';

/** How often lut checks for an update on its own (E25-05). */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** The channel to check: the chosen one, or the installed version's (a `-beta.N` lut is on beta). */
export function resolveChannel(choice: UpdateChannel | null, version: string): UpdateChannel {
  return choice ?? (version.includes('-') ? 'beta' : 'stable');
}

/** Whether an automatic check is due: never checked, the interval passed, or the clock went back. */
export function isCheckDue(lastCheck: number | null, now: number): boolean {
  return lastCheck === null || now < lastCheck || now - lastCheck >= CHECK_INTERVAL_MS;
}
