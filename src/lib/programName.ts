/** Extensions a launcher shim or native binary carries on Windows. */
const LAUNCHER_EXTENSIONS = ['.exe', '.cmd', '.bat', '.ps1', '.com'] as const;

/**
 * A program's name from its path or file name, as the backend names running programs
 * (`program_name`): no directory, no launcher extension, ASCII lowercase. `C:\tools\NVim.exe`,
 * `/usr/bin/nvim` and `nvim` are all `nvim`.
 */
export function programName(path: string): string {
  const base = path.trim().split(/[/\\]/).pop() ?? '';
  const lower = base.replace(/[A-Z]/g, (c) => c.toLowerCase());
  const extension = LAUNCHER_EXTENSIONS.find((e) => lower.endsWith(e));
  return extension ? lower.slice(0, -extension.length) : lower;
}

/** Program names as `programName` gives them, without blanks or repeats, in their order. */
export function programNames(paths: readonly string[]): string[] {
  return [...new Set(paths.map(programName))].filter((name) => name !== '');
}
