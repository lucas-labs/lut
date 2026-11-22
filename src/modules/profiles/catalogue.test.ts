import { describe, expect, it } from 'vitest';
import { allowsShellTitle, offersProfiles, visibleProfiles } from './catalogue';
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

describe('offersProfiles', () => {
  it('offers none before the list is read, or when every profile is hidden and none is default', () => {
    expect(offersProfiles(null)).toBe(false);
    expect(offersProfiles({ profiles: [profile('a', true)], defaultProfileId: null })).toBe(false);
    expect(offersProfiles({ profiles: [profile('a', true)], defaultProfileId: 'a' })).toBe(true);
    expect(
      offersProfiles({ profiles: [profile('a', true), profile('b')], defaultProfileId: null }),
    ).toBe(true);
  });
});

describe('allowsShellTitle', () => {
  const quiet = { ...profile('quiet'), tab: { allowShellTitle: false } };
  const list = { profiles: [profile('loud'), quiet], defaultProfileId: 'quiet' };

  it("follows the pane's profile", () => {
    expect(allowsShellTitle(list, 'loud')).toBe(true);
    expect(allowsShellTitle(list, 'quiet')).toBe(false);
  });

  it('uses the default profile for a pane opened without one', () => {
    expect(allowsShellTitle(list, undefined)).toBe(false);
    expect(allowsShellTitle({ ...list, defaultProfileId: 'loud' }, undefined)).toBe(true);
  });

  it('allows none before the list is read or for a profile that is not listed', () => {
    expect(allowsShellTitle(null, 'loud')).toBe(false);
    expect(allowsShellTitle(list, 'gone')).toBe(false);
  });
});
