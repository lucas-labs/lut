import { invoke } from '@tauri-apps/api/core';
import type { ProfileAppearance, ProfileTab, TerminalProfile } from './model';

/** Why native refused a profile field (`profiles/validate.rs`). */
export type ProfileErrorCode =
  | 'emptyId'
  | 'reservedId'
  | 'emptyName'
  | 'emptyExecutable'
  | 'invalidEnvName'
  | 'reservedEnvName'
  | 'invalidEnvValue'
  | 'duplicateId';

/** One refused field: `name`, `executable`, `id` or `env.<NAME>`. */
export type ProfileError = { profileId: string; field: string; code: ProfileErrorCode };

/** The user's changes to a detected profile; each call replaces all of them. */
export type DetectedOverride = {
  hidden?: boolean;
  appearance?: ProfileAppearance;
  tab?: ProfileTab;
};

/** How a profiles command failed: fields to mark, or one reason to tell. */
export type ProfilesFailure =
  { kind: 'invalid'; errors: ProfileError[] } | { kind: 'other'; message: string };

const ERROR_MESSAGES: Record<ProfileErrorCode, string> = {
  emptyId: 'The profile has no id.',
  reservedId: 'Ids starting with "detected:" are reserved for detected profiles.',
  emptyName: 'Enter a name.',
  emptyExecutable: 'Enter the program to run.',
  invalidEnvName: 'Variable names cannot be empty or contain "=".',
  reservedEnvName: 'Variables starting with LUT_ are reserved.',
  invalidEnvValue: 'The value contains a character a variable cannot hold.',
  duplicateId: 'Another profile has the same id.',
};

export function errorMessage(code: ProfileErrorCode): string {
  return ERROR_MESSAGES[code];
}

/** The first error of each field of `profileId`, by field path. */
export function errorsByField(
  errors: ProfileError[],
  profileId: string,
): Record<string, ProfileErrorCode> {
  const byField: Record<string, ProfileErrorCode> = {};
  for (const error of errors) {
    if (error.profileId === profileId) byField[error.field] ??= error.code;
  }
  return byField;
}

/** Reads what a profiles command rejected with: its tagged error, or Tauri's plain message. */
export function readFailure(error: unknown): ProfilesFailure {
  if (typeof error === 'object' && error !== null && 'kind' in error) {
    const failure = error as { kind: string; errors?: ProfileError[]; message?: string };
    switch (failure.kind) {
      case 'invalid':
        return { kind: 'invalid', errors: failure.errors ?? [] };
      case 'notFound':
        return { kind: 'other', message: 'The profile no longer exists.' };
      case 'readOnly':
        return { kind: 'other', message: 'Detected profiles cannot be changed this way.' };
      case 'io':
        return {
          kind: 'other',
          message: failure.message ?? 'The profiles file could not be written.',
        };
    }
  }
  return { kind: 'other', message: error instanceof Error ? error.message : String(error) };
}

export function saveProfile(profile: TerminalProfile): Promise<void> {
  return invoke('profiles_save', { profile });
}

export function deleteProfile(id: string): Promise<void> {
  return invoke('profiles_delete', { id });
}

export function setDetectedOverride(id: string, changes: DetectedOverride): Promise<void> {
  return invoke('profiles_set_detected_override', { id, changes });
}

/** A fresh id for a profile the user creates; native reserves `detected:`. */
export function newProfileId(): string {
  return `custom:${crypto.randomUUID()}`;
}
