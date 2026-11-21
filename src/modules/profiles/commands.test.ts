import { describe, expect, it } from 'vitest';
import { errorMessage, errorsByField, newProfileId, readFailure } from './commands';

describe('readFailure', () => {
  it('reads the fields native refused', () => {
    const errors = [{ profileId: 'a', field: 'name', code: 'emptyName' as const }];
    expect(readFailure({ kind: 'invalid', errors })).toEqual({ kind: 'invalid', errors });
  });

  it('tells the other failures as one message', () => {
    expect(readFailure({ kind: 'io', message: 'disk full' })).toEqual({
      kind: 'other',
      message: 'disk full',
    });
    expect(readFailure({ kind: 'notFound', id: 'a' })).toEqual({
      kind: 'other',
      message: 'The profile no longer exists.',
    });
    // Arguments Tauri could not read reject with a plain string.
    expect(readFailure('invalid args `profile`')).toEqual({
      kind: 'other',
      message: 'invalid args `profile`',
    });
  });
});

describe('errorsByField', () => {
  it('keeps the first error of each field of the profile', () => {
    expect(
      errorsByField(
        [
          { profileId: 'a', field: 'env.X=Y', code: 'invalidEnvName' },
          { profileId: 'a', field: 'name', code: 'emptyName' },
          { profileId: 'b', field: 'executable', code: 'emptyExecutable' },
          { profileId: 'a', field: 'name', code: 'duplicateId' },
        ],
        'a',
      ),
    ).toEqual({ 'env.X=Y': 'invalidEnvName', name: 'emptyName' });
  });
});

describe('profile ids and messages', () => {
  it('makes fresh ids outside the detected ones', () => {
    const [one, two] = [newProfileId(), newProfileId()];
    expect(one).toMatch(/^custom:/);
    expect(one).not.toBe(two);
  });

  it('has a message for each refused field', () => {
    expect(errorMessage('emptyExecutable')).toBe('Enter the program to run.');
  });
});
