import { invoke } from '@tauri-apps/api/core';

let cached: string | undefined;
let argDir: string | undefined;

export async function initLaunchDir(): Promise<void> {
  const arg = await invoke<string | null>('get_launch_dir').catch(() => null);
  argDir = arg ? arg.replace(/\\/g, '/') : undefined;
  const dir = arg ?? (await invoke<string>('workspace_current_dir').catch(() => null));
  cached = dir ? dir.replace(/\\/g, '/') : undefined;
}

/** The folder lut was opened with, else the process's own (or home). */
export function getLaunchDir(): string | undefined {
  return cached;
}

/** Only the folder lut was explicitly opened with (`lut <folder>`), never a fallback. */
export function getLaunchArgDir(): string | undefined {
  return argDir;
}

/**
 * Drains the files passed via the OS "Open With" action (CLI args on
 * Linux/Windows, macOS open-files event). Drained once so HMR / re-mounts
 * can't replay them. Returns [] when the app wasn't launched with a file.
 */
export async function consumeLaunchFiles(): Promise<string[]> {
  const files = await invoke<string[]>('get_launch_files').catch(() => []);
  return files.map((f) => f.replace(/\\/g, '/'));
}
