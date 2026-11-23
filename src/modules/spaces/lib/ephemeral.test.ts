import { describe, expect, it } from 'vitest';
import {
  EPHEMERAL_SPACE_ID,
  ephemeralSpaceMeta,
  ephemeralTabCwd,
  isEphemeralSpace,
} from './ephemeral';

const prefs = { enabled: true, name: 'Scratch', color: null, folder: '' };

describe('the ephemeral Space (E16-15)', () => {
  it('opens its terminal in the folder lut was opened with, else its folder setting, else the profile one', () => {
    expect(ephemeralTabCwd('C:/launch', 'C:/setting')).toBe('C:/launch');
    expect(ephemeralTabCwd(null, 'C:/setting')).toBe('C:/setting');
    expect(ephemeralTabCwd(null, '  ')).toBeNull();
    expect(ephemeralTabCwd(null, '')).toBeNull();
  });

  it('is built from its settings, with the colour only when one is set', () => {
    const meta = ephemeralSpaceMeta(prefs, { kind: 'local' }, 'C:/work', 5);
    expect(meta).toEqual({
      id: EPHEMERAL_SPACE_ID,
      name: 'Scratch',
      root: 'C:/work',
      env: { kind: 'local' },
      createdAt: 5,
      updatedAt: 5,
    });
    expect(ephemeralSpaceMeta({ ...prefs, color: 2 }, { kind: 'local' }, null).color).toBe(2);
  });

  it('is told apart by its id', () => {
    expect(isEphemeralSpace(EPHEMERAL_SPACE_ID)).toBe(true);
    expect(isEphemeralSpace('default')).toBe(false);
    expect(isEphemeralSpace(null)).toBe(false);
  });
});
