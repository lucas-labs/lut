/**
 * Loader for the hinted glyph rasterizer (`src/lib.rs`, built by `pnpm build:glyph-raster`).
 * Everything after `load` is synchronous, so a glyph atlas can rasterize on demand.
 */

/** SHA-256 of `glyph-raster.wasm`; `pnpm build:glyph-raster` prints it after a rebuild. */
export const GLYPH_RASTER_WASM_SHA256 =
  '0df25a6cf7dcc6c828ea106f9c5e5b03b5af8c247d25c84f5d4a0bf3d9a9f494';

/** Grid-fit the outline before filling it. */
export const FLAG_HINT = 1;
/** Thicken the outline: a bold the font has no face for. */
export const FLAG_EMBOLDEN = 2;
/** Slant the outline: an italic the font has no face for. */
export const FLAG_OBLIQUE = 4;

export type GlyphMask = {
  readonly width: number;
  readonly height: number;
  /** Offset of the mask's top-left pixel from the pen at the baseline (y grows downwards). */
  readonly left: number;
  readonly top: number;
  /** `width * height` coverage bytes. Borrowed: valid until the next call into the rasterizer. */
  readonly pixels: Uint8Array;
};

type Exports = {
  readonly memory: WebAssembly.Memory;
  lut_alloc(len: number): number;
  lut_font_load(pointer: number, len: number, index: number): number;
  lut_font_has_weight_axis(font: number): number;
  lut_font_drop(font: number): void;
  lut_font_glyph(font: number, codepoint: number): number;
  lut_rasterize(font: number, glyph: number, size: number, weight: number, flags: number): number;
  lut_result_header(): number;
  lut_result_pixels(): number;
};

const REQUIRED_EXPORTS: readonly (keyof Exports)[] = [
  'memory',
  'lut_alloc',
  'lut_font_load',
  'lut_font_drop',
  'lut_font_has_weight_axis',
  'lut_font_glyph',
  'lut_rasterize',
  'lut_result_header',
  'lut_result_pixels',
];

export class GlyphRaster {
  private constructor(private readonly exports: Exports) {}

  static async load(
    url = new URL('../glyph-raster.wasm', import.meta.url).href,
  ): Promise<GlyphRaster> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch the glyph rasterizer: ${response.status} ${response.statusText}`,
      );
    }
    return GlyphRaster.fromBytes(await response.arrayBuffer());
  }

  static async fromBytes(bytes: BufferSource): Promise<GlyphRaster> {
    const { instance } = await WebAssembly.instantiate(bytes, {});
    const exports = instance.exports as Record<string, unknown>;
    for (const name of REQUIRED_EXPORTS) {
      if (!(name in exports)) throw new Error(`The glyph rasterizer lacks ${name}`);
    }
    return new GlyphRaster(exports as unknown as Exports);
  }

  /** Loads face `index` of a font file. Returns a handle, or 0 when the bytes hold no such face. */
  loadFont(bytes: Uint8Array, index = 0): number {
    const pointer = this.exports.lut_alloc(bytes.byteLength);
    new Uint8Array(this.exports.memory.buffer, pointer, bytes.byteLength).set(bytes);
    return this.exports.lut_font_load(pointer, bytes.byteLength, index);
  }

  /** Whether `rasterize` draws the weight it is given (the face has a weight axis). */
  hasWeightAxis(font: number): boolean {
    return this.exports.lut_font_has_weight_axis(font) !== 0;
  }

  dropFont(font: number): void {
    this.exports.lut_font_drop(font);
  }

  /** The glyph `codepoint` maps to in `font`, or 0 when the font lacks it. */
  glyph(font: number, codepoint: number): number {
    return this.exports.lut_font_glyph(font, codepoint);
  }

  /** `glyph` at `size` pixels per em and `weight` (variable fonts), or null when it fails. */
  rasterize(
    font: number,
    glyph: number,
    size: number,
    weight: number,
    flags: number,
  ): GlyphMask | null {
    if (!this.exports.lut_rasterize(font, glyph, size, weight, flags)) return null;
    const buffer = this.exports.memory.buffer;
    const [width, height, left, top] = new Int32Array(buffer, this.exports.lut_result_header(), 4);
    const pixels = new Uint8Array(buffer, this.exports.lut_result_pixels(), width * height);
    return { width, height, left, top, pixels };
  }
}
