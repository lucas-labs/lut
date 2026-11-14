/**
 * The colour of a Git status in the explorer, the Git panel and the history: modified in the attention colour, added
 * and untracked green, deleted red, renamed and copied blue, anything else muted.
 */
export function gitStatusTextClass(code: string): string {
  switch (code.toUpperCase()) {
    case 'M':
      return 'text-warning';
    case 'A':
    case 'U':
      return 'text-[var(--terminal-ansi-green)]';
    case 'D':
      return 'text-[var(--terminal-ansi-red)]';
    case 'R':
    case 'C':
      return 'text-[var(--terminal-ansi-blue)]';
    default:
      return 'text-muted-foreground';
  }
}
