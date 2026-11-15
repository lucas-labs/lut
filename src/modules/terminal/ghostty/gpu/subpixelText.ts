/**
 * Subpixel (ClearType-style) terminal text, a prototype for E13-13: off unless
 * `localStorage["lut:terminal-subpixel"]` names the order of the panel's colour stripes, "rgb" or
 * "bgr". Only the WebGPU renderer draws it, and only where text is hinted (`hintedGlyphs.ts`) and
 * the GPU can blend each colour channel on its own (`dual-source-blending`).
 */
export type SubpixelOrder = 'rgb' | 'bgr';

const SUBPIXEL_STORAGE_KEY = 'lut:terminal-subpixel';

/** The order a stored value names, or null for grayscale text. */
export function subpixelOrderFor(value: string | null | undefined): SubpixelOrder | null {
  const order = value?.trim().toLowerCase();
  return order === 'rgb' || order === 'bgr' ? order : null;
}

/** The order the user asked for through `localStorage`, or null. */
export function currentSubpixelOrder(): SubpixelOrder | null {
  try {
    return subpixelOrderFor(window.localStorage?.getItem(SUBPIXEL_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * The order new glyph atlases draw with: the requested one when this GPU and platform can draw
 * it, otherwise null, with the reason it cannot.
 */
export function resolveSubpixelOrder(
  requested: SubpixelOrder | null,
  support: { readonly dualSourceBlending: boolean; readonly hinting: boolean },
): { readonly order: SubpixelOrder | null; readonly unavailable: string | null } {
  if (!requested) return { order: null, unavailable: null };
  if (!support.hinting) return { order: null, unavailable: 'text is not hinted on this platform' };
  if (!support.dualSourceBlending) {
    return { order: null, unavailable: 'the GPU has no dual-source-blending' };
  }
  return { order: requested, unavailable: null };
}
