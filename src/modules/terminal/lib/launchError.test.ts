import { describe, expect, it } from 'vitest';
import { parseLaunchError } from './launchError';

describe('parseLaunchError', () => {
  it.each([
    { code: 'profileNotFound', id: 'gone', message: 'terminal profile not found: gone' },
    { code: 'executableNotFound', program: 'nu.exe', message: 'executable not found: nu.exe' },
    {
      code: 'cwdUnavailable',
      cwd: 'D:\\gone',
      reason: 'missing',
      message: 'directory not available',
    },
    { code: 'distroNotInstalled', distro: 'Debian', message: 'WSL distro Debian is not installed' },
    { code: 'distroNotInstalled', distro: null, message: 'no WSL distro is installed' },
    { code: 'spawnFailed', reason: 'boom', message: 'boom' },
  ])('reads $code as native serializes it', (error) => {
    expect(parseLaunchError(error)).toEqual(error);
  });

  it.each([
    ['a string', 'invalid args'],
    ['null', null],
    ['an unknown code', { code: 'other', message: 'm' }],
    ['no message', { code: 'spawnFailed', reason: 'boom' }],
    ['a missing field', { code: 'profileNotFound', message: 'm' }],
    ['a distro of the wrong type', { code: 'distroNotInstalled', distro: 3, message: 'm' }],
  ])('ignores %s', (_, value) => {
    expect(parseLaunchError(value)).toBeNull();
  });
});
