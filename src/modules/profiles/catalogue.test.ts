import { describe, expect, it } from 'vitest';
import { visibleProfiles } from './catalogue';
import type { ProfileEntry } from './model';

function profile(id: string, hidden = false): ProfileEntry {
  return {
    id,
    name: id,
    args: [],
    env: {},
    loadUserProfile: true,
    environment: { kind: 'native' },
    appearance: {},
    tab: { allowShellTitle: true },
    closeBehavior: 'close',
    source: 'detected',
    hidden,
  };
}

const ids = (profiles: ProfileEntry[]) => profiles.map((p) => p.id);

describe('visibleProfiles', () => {
  it('puts the default first and keeps the listed order of the others', () => {
    const list = { profiles: [profile('a'), profile('b'), profile('c')], defaultProfileId: 'b' };
    expect(ids(visibleProfiles(list))).toEqual(['b', 'a', 'c']);
  });

  it('leaves hidden profiles out', () => {
    const list = {
      profiles: [profile('a'), profile('b', true), profile('c')],
      defaultProfileId: 'a',
    };
    expect(ids(visibleProfiles(list))).toEqual(['a', 'c']);
  });

  it('offers a hidden default, which is what a new tab opens', () => {
    const list = { profiles: [profile('a'), profile('b', true)], defaultProfileId: 'b' };
    expect(ids(visibleProfiles(list))).toEqual(['b', 'a']);
  });

  it('lists the profiles in order when there is no default', () => {
    const list = { profiles: [profile('a'), profile('b')], defaultProfileId: null };
    expect(ids(visibleProfiles(list))).toEqual(['a', 'b']);
  });
});
