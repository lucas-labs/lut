import { getIdentifier } from '@tauri-apps/api/app';

/**
 * The identifier of a dev build. The backend picks it on a debug build (`lut-control-protocol`'s `IDENTIFIER`,
 * E25-10), whatever mode the frontend was built in.
 */
const DEV_IDENTIFIER = 'dev.lucode.lut.dev';

let dev: Promise<boolean> | undefined;

/** Whether this is a dev build (it never updates, E25-05); `false` when the identifier cannot be read. Asked once. */
export function isDevBuild(): Promise<boolean> {
  dev ??= getIdentifier().then(
    (identifier) => identifier === DEV_IDENTIFIER,
    () => false,
  );
  return dev;
}

/**
 * The app's name as the window shows it: `lut (dev)` for a dev build, which runs apart from an installed lut, so the
 * two tell apart; `lut` otherwise, and when the identifier cannot be read.
 */
export async function appName(): Promise<string> {
  return (await isDevBuild()) ? 'lut (dev)' : 'lut';
}
