import { invoke } from '@tauri-apps/api/core';

/** A profiles store lut could not use at startup, so it started with the defaults (E14-04). */
export type ProfilesLoadError = {
  /** Where the unusable file was moved; empty when it could not be read and was left in place. */
  backupPath: string;
  reason: string;
};

/** The startup recovery, drained once so a reload or a second window can't report it twice. */
export async function takeProfilesLoadError(): Promise<ProfilesLoadError | null> {
  return invoke<ProfilesLoadError | null>('profiles_take_load_error').catch(() => null);
}
