import cyrillicUrl from '@/assets/fonts/source-code-pro-cyrillic.ttf?url';
import latinUrl from '@/assets/fonts/source-code-pro-latin.ttf?url';
import { BUNDLED_MONO_FAMILY, isFontAvailable } from '@/lib/fonts';
import { IS_MAC } from '@/modules/platform';
import {
  FLAG_EMBOLDEN,
  FLAG_HINT,
  FLAG_OBLIQUE,
  type GlyphMask,
  GlyphRaster,
} from '@lut/glyph-raster';
import { invoke } from '@tauri-apps/api/core';
import { isPrivateUse } from './GlyphPlacement';

/**
 * Hinted terminal text (Windows and Linux). The canvas draws glyphs without grid fitting, so a
 * vertical stem between two pixels comes out as two grey ones; native terminals snap stems to
 * whole pixels. Here the leading families of the terminal's font chain that lut has the files
 * for (installed fonts through the backend, the bundled Source Code Pro) are rasterized by
 * `@lut/glyph-raster`, which hints each glyph. A character none of them has, icons (private use)
 * and everything when the files are not ready yet go to the canvas as before, which continues
 * the same chain, so fallback order does not change. macOS keeps the canvas: CoreText draws
 * without hinting, as the rest of the system does.
 */

/** Style slot: `GLYPH_STYLE_BOLD` (1) and `GLYPH_STYLE_ITALIC` (2) combined. */
type Style = 0 | 1 | 2 | 3;

type Face = {
  readonly handle: number;
  /** Weight to rasterize at: the requested one on a weight axis, otherwise the face's own. */
  readonly weight: number;
  readonly flags: number;
};

/** The faces of one family for each style slot (the bundled font spans two files per slot). */
type FamilyFaces = readonly [Face[], Face[], Face[], Face[]];

type FontFace = { id: string; index: number; weight: number; italic: boolean };

const GENERIC_FAMILIES = new Set([
  'monospace',
  'serif',
  'sans-serif',
  'system-ui',
  'ui-monospace',
  'cursive',
  'fantasy',
]);

let rasterPromise: Promise<GlyphRaster | null> | null = null;
let raster: GlyphRaster | null = null;
/** Loaded file handles by `id#index`, shared by every chain. */
const handles = new Map<string, Promise<number>>();
const chains = new Map<string, Promise<void>>();
const ready = new Map<string, readonly FamilyFaces[]>();

export function hintingEnabled(): boolean {
  return !IS_MAC;
}

function chainKey(family: string, weight: string): string {
  return `${weight}\n${family}`;
}

/** CSS weight keyword or number as a number. */
export function cssWeight(weight: string): number {
  if (weight === 'bold') return 700;
  const value = Number.parseInt(weight, 10);
  return Number.isFinite(value) && value > 0 ? value : 400;
}

/** The family names of a CSS `font-family` list, unquoted, in order. */
export function familyNames(family: string): string[] {
  const names: string[] = [];
  for (const match of family.matchAll(/\s*(?:"([^"]*)"|'([^']*)'|([^,]+?))\s*(?:,|$)/g)) {
    const name = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (name) names.push(name);
  }
  return names;
}

/**
 * Loads what hinted rasterization needs for `family` at `weight`. Never rejects: whatever fails
 * leaves those glyphs to the canvas.
 */
export function prepareHintedFonts(family: string, weight: string): Promise<void> {
  if (!hintingEnabled()) return Promise.resolve();
  const key = chainKey(family, weight);
  let pending = chains.get(key);
  if (!pending) {
    pending = loadChain(family, cssWeight(weight))
      .then((faces) => {
        ready.set(key, faces);
      })
      .catch((error: unknown) => {
        console.warn('hinted terminal text is unavailable', error);
        ready.set(key, []);
      });
    chains.set(key, pending);
  }
  return pending;
}

function loadRaster(): Promise<GlyphRaster | null> {
  rasterPromise ??= GlyphRaster.load().then(
    (loaded) => (raster = loaded),
    (error: unknown) => {
      console.warn('the glyph rasterizer did not load', error);
      return null;
    },
  );
  return rasterPromise;
}

async function loadChain(family: string, weight: number): Promise<FamilyFaces[]> {
  const glyphs = await loadRaster();
  if (!glyphs) return [];
  const families: FamilyFaces[] = [];
  for (const name of familyNames(family)) {
    if (GENERIC_FAMILIES.has(name.toLowerCase())) break;
    if (name === BUNDLED_MONO_FAMILY) {
      families.push(await bundledFaces(glyphs, weight));
      // Past the bundled font come icon faces and system fallbacks: the canvas handles those.
      break;
    }
    // A family the webview cannot find is skipped by the canvas too.
    if (!isFontAvailable(name)) continue;
    const faces = await installedFaces(glyphs, name, weight);
    // The webview draws this family but lut cannot read it: hinting it differently from the
    // canvas would change which font draws what, so the prefix ends here.
    if (!faces) break;
    families.push(faces);
  }
  return families;
}

async function bundledFaces(glyphs: GlyphRaster, weight: number): Promise<FamilyFaces> {
  const files = await Promise.all(
    [latinUrl, cyrillicUrl].map((url) =>
      loadHandle(
        glyphs,
        url,
        0,
        async () => new Uint8Array(await (await fetch(url)).arrayBuffer()),
      ),
    ),
  );
  const slot = (style: Style): Face[] =>
    files
      .filter((handle) => handle > 0)
      .map((handle) => ({
        handle,
        weight: style & 1 ? 700 : weight,
        flags: FLAG_HINT | (style & 2 ? FLAG_OBLIQUE : 0),
      }));
  return [slot(0), slot(1), slot(2), slot(3)];
}

async function installedFaces(
  glyphs: GlyphRaster,
  family: string,
  weight: number,
): Promise<FamilyFaces | null> {
  const slots = await Promise.all(
    ([0, 1, 2, 3] as const).map((style) => installedFace(glyphs, family, weight, style)),
  );
  if (slots.some((slot) => slot === null)) return null;
  return slots.map((slot) => [slot as Face]) as unknown as FamilyFaces;
}

async function installedFace(
  glyphs: GlyphRaster,
  family: string,
  weight: number,
  style: Style,
): Promise<Face | null> {
  const wanted = style & 1 ? 700 : weight;
  const italic = (style & 2) !== 0;
  const face = await invoke<FontFace | null>('font_face_find', { family, weight: wanted, italic });
  if (!face) return null;
  const handle = await loadHandle(glyphs, face.id, face.index, async () => {
    const data = await invoke<ArrayBuffer>('font_face_data', { id: face.id });
    return new Uint8Array(data);
  });
  if (handle === 0) return null;
  const variable = glyphs.hasWeightAxis(handle);
  // CSS synthesizes bold when the closest face is much lighter, and oblique for a missing italic.
  const embolden = !variable && wanted >= 600 && face.weight < 600;
  return {
    handle,
    weight: variable ? wanted : face.weight,
    flags: FLAG_HINT | (embolden ? FLAG_EMBOLDEN : 0) | (italic && !face.italic ? FLAG_OBLIQUE : 0),
  };
}

function loadHandle(
  glyphs: GlyphRaster,
  id: string,
  index: number,
  read: () => Promise<Uint8Array>,
): Promise<number> {
  const key = `${id}#${index}`;
  let handle = handles.get(key);
  if (!handle) {
    handle = read().then((bytes) => glyphs.loadFont(bytes, index));
    handles.set(key, handle);
  }
  return handle;
}

/**
 * `text` hinted at `size` device pixels per em, or null when the canvas should draw it: hinting
 * is off or not ready, `text` is not one non-icon code point, or no prepared family has it.
 * The mask is borrowed until the next call.
 */
export function rasterizeHinted(
  family: string,
  weight: string,
  text: string,
  style: number,
  size: number,
): GlyphMask | null {
  if (!raster) return null;
  const faces = ready.get(chainKey(family, weight));
  if (!faces || faces.length === 0) return null;
  const codepoint = text.codePointAt(0) ?? 0;
  if (text.length !== (codepoint > 0xffff ? 2 : 1) || isPrivateUse(codepoint)) return null;
  for (const family of faces) {
    for (const face of family[(style & 3) as Style]) {
      const glyph = raster.glyph(face.handle, codepoint);
      if (glyph !== 0) return raster.rasterize(face.handle, glyph, size, face.weight, face.flags);
    }
  }
  return null;
}
