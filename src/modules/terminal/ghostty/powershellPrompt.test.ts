import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// OSC 133;A starts a fresh line when the cursor is not at column 0, so it must reach the terminal before a prompt that
// prints itself (Write-Host, as pshazz does); otherwise the cursor lands one line below the prompt (E14-19).
const pwsh = process.platform === 'win32' ? 'pwsh.exe' : 'pwsh';
const available = spawnSync(pwsh, ['-NoLogo', '-NoProfile', '-Command', 'exit 0']).status === 0;
const integration = fileURLToPath(
  new URL('../../../../src-tauri/src/modules/pty/scripts/profile.ps1', import.meta.url),
);

const ESC = '\x1b';
const ST = `${ESC}\\`;
const START = `${ESC}]133;D;0${ST}${ESC}]133;A${ST}`;
const END = `${ESC}]133;B${ST}`;

/** Runs the integration over `userPrompt` and writes what the host would show: side output, then the returned text. */
function renderPrompt(userPrompt: string): string {
  const script = `
${userPrompt}
. '${integration.replace(/'/g, "''")}'
$global:LASTEXITCODE = 0
$text = prompt
[Console]::Write($text)
`;
  const run = spawnSync(pwsh, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'], {
    input: script,
    encoding: 'utf8',
  });
  expect(run.stderr).toBe('');
  expect(run.status).toBe(0);
  return run.stdout;
}

/** Drops OSC 7 (the cwd report), which depends on the machine and directory. */
const withoutCwd = (out: string) =>
  out.replace(new RegExp(`${ESC}\\]7;[^${ESC}]*${ESC}\\\\`, 'g'), '');

it.skipIf(!available).each([
  ['returns a string', `function prompt { 'PS> ' }`, `${START}PS> ${END}`],
  [
    'prints itself with Write-Host',
    `function prompt { Write-Host 'line one'; Write-Host -NoNewline '$'; ' ' }`,
    `${START}line one\n$ ${END}`,
  ],
])('emits the prompt-start markers before a prompt that %s', (_, userPrompt, expected) => {
  const out = renderPrompt(userPrompt);
  expect(withoutCwd(out).replace(/\r\n/g, '\n')).toBe(expected);
  expect(out).toMatch(new RegExp(`^${START.replace(/[\\[\]]/g, '\\$&')}${ESC}\\]7;file://`));
});

it.skipIf(!available)('keeps the default prompt', () => {
  const out = withoutCwd(renderPrompt('')).replace(/\r\n/g, '\n');
  expect(out.startsWith(START)).toBe(true);
  expect(out).toMatch(
    new RegExp(`^${START.replace(/[\\[\]]/g, '\\$&')}PS .+> ${END.replace(/[\\[\]]/g, '\\$&')}$`),
  );
});
