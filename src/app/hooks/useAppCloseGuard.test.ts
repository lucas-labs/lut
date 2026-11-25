import { describe, expect, it } from 'vitest';
import { appCloseMessage, canOptOutOfAppClosePrompt } from './useAppCloseGuard';

describe('canOptOutOfAppClosePrompt', () => {
  it('offers the opt-out when a running process is the only blocker', () => {
    expect(canOptOutOfAppClosePrompt({ dirtyEditors: 0, busyTerminal: true })).toBe(true);
  });

  it('withholds the opt-out whenever unsaved changes are also at stake', () => {
    expect(canOptOutOfAppClosePrompt({ dirtyEditors: 1, busyTerminal: true })).toBe(false);
    expect(canOptOutOfAppClosePrompt({ dirtyEditors: 2, busyTerminal: false })).toBe(false);
  });
});

describe('appCloseMessage', () => {
  it('names what quitting loses', () => {
    expect(appCloseMessage({ dirtyEditors: 1, busyTerminal: false })).toBe(
      '1 file has unsaved changes. Quitting will discard them.',
    );
    expect(appCloseMessage({ dirtyEditors: 0, busyTerminal: true })).toBe(
      'A process is still running in a terminal. Quitting will terminate it.',
    );
  });

  it('says restarting before an update', () => {
    expect(appCloseMessage({ dirtyEditors: 2, busyTerminal: true }, 'Restarting')).toBe(
      'A process is still running and 2 files have unsaved changes. Restarting will terminate it and discard the changes.',
    );
  });
});
