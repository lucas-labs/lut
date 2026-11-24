import { platform } from '@tauri-apps/plugin-os';

const REAL_PLATFORM = (() => {
  try {
    return platform();
  } catch {
    return '';
  }
})();

/**
 * The platform lut behaves as. In dev, `VITE_LUT_PLATFORM` (`macos`, `linux` or `windows`) overrides the real one to
 * preview another OS's UI; a release build drops the override.
 */
const PLATFORM: string =
  (import.meta.env.DEV && import.meta.env.VITE_LUT_PLATFORM) || REAL_PLATFORM;

export const IS_MAC = PLATFORM === 'macos';
export const IS_WINDOWS = PLATFORM === 'windows';
export const IS_LINUX = PLATFORM === 'linux';

/** Dev only: lut acts as macOS on another OS, so nothing draws the traffic lights and lut fakes them. */
export const FAKE_TRAFFIC_LIGHTS = import.meta.env.DEV && IS_MAC && REAL_PLATFORM !== 'macos';

/** Custom window controls (min/max/close) are rendered by us only on
 * non-macOS platforms — macOS keeps the native traffic lights via the
 * overlay title bar. */
export const USE_CUSTOM_WINDOW_CONTROLS = !IS_MAC && PLATFORM !== '';

/** KeyBinding property name for the platform's primary modifier. */
export const MOD_PROP: 'meta' | 'ctrl' = IS_MAC ? 'meta' : 'ctrl';
/** Cmd on macOS, Ctrl on Windows/Linux: each OS's native file-manager
 * convention for toggling one item in/out of a multi-selection. */
export function isPrimaryModifierPressed(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return IS_MAC ? e.metaKey : e.ctrlKey;
}
export const KEY_SEP = IS_MAC ? '' : '+';

export function fmtShortcut(...parts: string[]): string {
  return parts.join(KEY_SEP);
}
