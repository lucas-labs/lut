import { describe, expect, it } from 'vitest';
import { migrateShortcutIds } from './store';

describe('migrateShortcutIds', () => {
  it('moves a binding recorded for zen mode to focus mode', () => {
    const binding = [{ ctrl: true, shift: true, key: 'z' }];
    expect(migrateShortcutIds({ 'view.zenMode': binding, 'tab.new': [] })).toEqual({
      'view.focusMode': binding,
      'tab.new': [],
    });
  });

  it('keeps a binding already recorded under the new id', () => {
    const current = [{ ctrl: true, shift: true, key: 'f' }];
    expect(
      migrateShortcutIds({
        'view.zenMode': [{ ctrl: true, shift: true, key: 'z' }],
        'view.focusMode': current,
      }),
    ).toEqual({ 'view.focusMode': current });
  });

  it('leaves nothing stored as nothing', () => {
    expect(migrateShortcutIds(undefined)).toBeUndefined();
  });
});
