/** Extensions a launcher shim or native binary carries on Windows. */
const LAUNCHER_EXTENSIONS = ['.exe', '.cmd', '.bat', '.ps1', '.com'] as const;

/**
 * A program's name from its path or file name, as the backend names running programs
 * (`program_name`): no directory, no launcher extensions, ASCII lowercase. `C:\tools\NVim.exe`,
 * `/usr/bin/nvim` and `nvim` are all `nvim`. Every launcher extension goes, so a name keeps its form
 * when it is named again (a saved name, read back).
 */
export function programName(path: string): string {
  const base = path.trim().split(/[/\\]/).pop() ?? '';
  let name = base.replace(/[A-Z]/g, (c) => c.toLowerCase());
  for (;;) {
    const extension = LAUNCHER_EXTENSIONS.find((e) => name.endsWith(e));
    if (!extension) return name;
    name = name.slice(0, -extension.length);
  }
}

/** Program names as `programName` gives them, without blanks or repeats, in their order. */
export function programNames(paths: readonly string[]): string[] {
  return [...new Set(paths.map(programName))].filter((name) => name !== '');
}
