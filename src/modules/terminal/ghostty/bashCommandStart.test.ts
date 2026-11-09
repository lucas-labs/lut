import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// Bash 4.4+ reports that a command started through PS0. Older Bash (macOS ships
// 3.2) cannot, so its prompt end carries `lut_blocks=0` and the host never
// types a command on the user's behalf into it (see promptInjection.ts).
it.skipIf(process.platform === 'win32')('tells the host whether Bash reports command start', () => {
  const script = fileURLToPath(
    new URL('../../../../src-tauri/src/modules/pty/scripts/bashrc.bash', import.meta.url),
  );
  const result = spawnSync(
    process.platform === 'darwin' ? '/bin/bash' : 'bash',
    [
      '--noprofile',
      '--norc',
      '-c',
      `
source() { :; }
PS1='test> '
. "$1" >/dev/null
eval "$PROMPT_COMMAND" >/dev/null
if (( BASH_VERSINFO[0] > 4 || BASH_VERSINFO[0] == 4 && BASH_VERSINFO[1] >= 4 )); then
  case "$PS0" in *'133;C'*) ;; *) exit 11 ;; esac
  case "$PS1" in *'lut_blocks=0'*) exit 12 ;; esac
else
  case "$PS1" in *'test> '*'lut_blocks=0'*) ;; *) exit 13 ;; esac
fi
`,
      'lut-test',
      script,
    ],
    {
      env: { PATH: process.env.PATH ?? '/usr/bin:/bin' },
      encoding: 'utf8',
      timeout: 5000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});
