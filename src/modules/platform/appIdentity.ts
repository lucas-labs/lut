import { getIdentifier } from '@tauri-apps/api/app';

/**
 * The identifier of a dev build. The backend picks it on a debug build (`lut-control-protocol`'s `IDENTIFIER`,
 * E25-10), whatever mode the frontend was built in.
 */
const DEV_IDENTIFIER = 'dev.lucode.lut.dev';

let name: Promise<string> | undefined;

/**
 * The app's name as the window shows it: `lut (dev)` for a dev build, which runs apart from an installed lut, so the
 * two tell apart; `lut` otherwise, and when the identifier cannot be read. Asked once.
 */
export function appName(): Promise<string> {
  name ??= getIdentifier().then(
    (identifier) => (identifier === DEV_IDENTIFIER ? 'lut (dev)' : 'lut'),
    () => 'lut',
  );
  return name;
}
