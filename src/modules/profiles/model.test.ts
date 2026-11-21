import { describe, expect, it } from 'vitest';
import { parseProfilesList } from './model';

// As native serializes `profiles_list`: optional fields are left out when unset.
const detected = {
  id: 'detected:pwsh',
  name: 'PowerShell',
  executable: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  args: [],
  env: {},
  loadUserProfile: true,
  environment: { kind: 'native' },
  appearance: {},
  tab: { allowShellTitle: true },
  closeBehavior: 'close',
  source: 'detected',
  hidden: false,
};

const custom = {
  id: 'dev',
  name: 'Dev',
  args: ['-l'],
  env: { EDITOR: 'nvim', PAGER: null },
  loadUserProfile: false,
  startingDirectory: '~/src',
  environment: { kind: 'wsl', distro: 'Ubuntu' },
  appearance: {
    themeId: 'dark',
    fontSize: 13,
    cursorStyle: 'block',
    cursorBlink: false,
    scrollback: 5000,
  },
  tab: { title: 'dev', color: '#ff8800', icon: 'code', allowShellTitle: false },
  closeBehavior: 'keepOpen',
  source: 'custom',
  hidden: true,
};

describe('parseProfilesList', () => {
  it('reads detected and custom profiles with their optional fields', () => {
    const list = parseProfilesList({ profiles: [detected, custom], defaultProfileId: 'dev' });
    expect(list.defaultProfileId).toBe('dev');
    expect(list.profiles[0]).toMatchObject({
      id: 'detected:pwsh',
      environment: { kind: 'native' },
    });
    expect(list.profiles[0]?.startingDirectory).toBeUndefined();
    expect(list.profiles[1]).toMatchObject({
      env: { EDITOR: 'nvim', PAGER: null },
      environment: { kind: 'wsl', distro: 'Ubuntu' },
      appearance: { themeId: 'dark', fontSize: 13, cursorStyle: 'block' },
      tab: { title: 'dev', allowShellTitle: false },
      closeBehavior: 'keepOpen',
      hidden: true,
    });
  });

  it('reads an empty list without a default', () => {
    expect(parseProfilesList({ profiles: [], defaultProfileId: null })).toEqual({
      profiles: [],
      defaultProfileId: null,
    });
  });

  it.each([
    ['a missing list', { defaultProfileId: null }],
    [
      'a profile without an id',
      { profiles: [{ ...detected, id: undefined }], defaultProfileId: null },
    ],
    [
      'an unknown close behaviour',
      { profiles: [{ ...detected, closeBehavior: 'never' }], defaultProfileId: null },
    ],
    [
      'an unknown environment',
      { profiles: [{ ...detected, environment: { kind: 'ssh' } }], defaultProfileId: null },
    ],
    [
      'an argument that is not text',
      { profiles: [{ ...detected, args: [1] }], defaultProfileId: null },
    ],
  ])('rejects %s', (_, value) => {
    expect(() => parseProfilesList(value)).toThrow('Unexpected terminal profile data');
  });
});
