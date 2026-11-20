/**
 * Why `pty_open` failed or, for `cwdUnavailable`, why the terminal started somewhere else: native's
 * `LaunchError`, told apart by `code`. `message` reads as is.
 */
export type LaunchError =
  | { code: 'profileNotFound'; id: string; message: string }
  | { code: 'executableNotFound'; program: string; message: string }
  | { code: 'cwdUnavailable'; cwd: string; reason: string; message: string }
  /** `distro` is `null` when no distro is installed at all. */
  | { code: 'distroNotInstalled'; distro: string | null; message: string }
  | { code: 'spawnFailed'; reason: string; message: string };

/** A rejected `pty_open` that native explained; other rejections stay as they came. */
export class PtyLaunchError extends Error {
  constructor(readonly launch: LaunchError) {
    super(launch.message);
    this.name = 'PtyLaunchError';
  }
}

/** Reads a `LaunchError` as native serializes it; `null` for anything else. */
export function parseLaunchError(value: unknown): LaunchError | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;
  const message = raw.message;
  if (typeof message !== 'string') return null;
  const field = (name: string) => (typeof raw[name] === 'string' ? (raw[name] as string) : null);
  switch (raw.code) {
    case 'profileNotFound': {
      const id = field('id');
      return id === null ? null : { code: 'profileNotFound', id, message };
    }
    case 'executableNotFound': {
      const program = field('program');
      return program === null ? null : { code: 'executableNotFound', program, message };
    }
    case 'cwdUnavailable': {
      const cwd = field('cwd');
      const reason = field('reason');
      return cwd === null || reason === null
        ? null
        : { code: 'cwdUnavailable', cwd, reason, message };
    }
    case 'distroNotInstalled': {
      const distro = field('distro');
      return distro === null && raw.distro !== null
        ? null
        : { code: 'distroNotInstalled', distro, message };
    }
    case 'spawnFailed': {
      const reason = field('reason');
      return reason === null ? null : { code: 'spawnFailed', reason, message };
    }
    default:
      return null;
  }
}
