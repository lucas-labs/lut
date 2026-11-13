import { describe, expect, it } from 'vitest';
import { splitSubject } from './subject';

describe('splitSubject', () => {
  it('splits the conventional-commit type, scope and breaking mark from the message', () => {
    expect(splitSubject('feat: add focus mode')).toEqual({
      type: 'feat:',
      message: 'add focus mode',
    });
    expect(splitSubject('fix(ui): ✨ keep the panel lazy')).toEqual({
      type: 'fix(ui):',
      message: '✨ keep the panel lazy',
    });
    expect(splitSubject('refactor(be)!: drop the cursor')).toEqual({
      type: 'refactor(be)!:',
      message: 'drop the cursor',
    });
  });

  it('keeps subjects without a type prefix whole', () => {
    for (const subject of [
      "Merge branch 'tab-colors'",
      'WIP: ',
      'feat:no space',
      'v1.2: release',
      '',
    ]) {
      expect(splitSubject(subject)).toEqual({ type: null, message: subject });
    }
  });
});
