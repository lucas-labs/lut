import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { FLAG_HINT, GLYPH_RASTER_WASM_SHA256, GlyphRaster } from '@lut/glyph-raster';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  invoke: vi.fn(),
  available: new Set<string>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: harness.invoke }));
vi.mock('@/modules/platform', () => ({ IS_MAC: false }));
vi.mock('@/lib/fonts', () => ({
  BUNDLED_MONO_FAMILY: 'Source Code Pro',
  isFontAvailable: (name: string) => harness.available.has(name),
}));

const ROOT = new URL('../../../../../', import.meta.url);
const WASM = new URL('packages/glyph-raster/glyph-raster.wasm', ROOT);
const LATIN = new URL('src/assets/fonts/source-code-pro-latin.ttf', ROOT);

/** Serves module and asset URLs (`file:` and Vite's `/src/...`) from the repository. */
async function fetchFromRepo(input: string | URL): Promise<Response> {
  const url = String(input);
  const path = url.startsWith('file:')
    ? fileURLToPath(url)
    : fileURLToPath(new URL(`.${url}`, ROOT));
  return new Response(await readFile(path));
}

async function loadModule() {
  return import('./hintedGlyphs');
}

/** Coverage of the mask's middle row. */
function middleRow(mask: { width: number; height: number; pixels: Uint8Array }): number[] {
  const row = Math.floor(mask.height / 2);
  return [...mask.pixels.subarray(row * mask.width, (row + 1) * mask.width)];
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('fetch', vi.fn(fetchFromRepo));
  harness.invoke.mockReset();
  harness.available.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('glyph-raster.wasm', () => {
  it('is the pinned build', async () => {
    const bytes = await readFile(WASM);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(GLYPH_RASTER_WASM_SHA256);
  });

  it('hints a stem onto whole pixels and reports missing glyphs', async () => {
    const raster = await GlyphRaster.fromBytes(await readFile(WASM));
    const font = raster.loadFont(new Uint8Array(await readFile(LATIN)));
    expect(font).toBeGreaterThan(0);
    expect(raster.hasWeightAxis(font)).toBe(true);
    expect(raster.glyph(font, 0x4e2d)).toBe(0);
    const mask = raster.rasterize(font, raster.glyph(font, 0x6c), 14, 400, FLAG_HINT);
    if (!mask) throw new Error('no mask');
    const row = middleRow(mask);
    expect(row.filter((value) => value >= 230).length).toBeGreaterThanOrEqual(1);
    expect(row.filter((value) => value > 25 && value < 230).length).toBeLessThanOrEqual(1);
  });

  it('refuses bytes that are not a font', async () => {
    const raster = await GlyphRaster.fromBytes(await readFile(WASM));
    expect(raster.loadFont(new Uint8Array([1, 2, 3, 4]))).toBe(0);
  });
});

describe('font chain parsing', () => {
  it('splits a CSS family list and unquotes it', async () => {
    const { familyNames } = await loadModule();
    expect(
      familyNames(`"SauceCodePro Nerd Font Mono", 'Source Code Pro', Menlo, monospace`),
    ).toEqual(['SauceCodePro Nerd Font Mono', 'Source Code Pro', 'Menlo', 'monospace']);
  });

  it('reads CSS weights', async () => {
    const { cssWeight } = await loadModule();
    expect(cssWeight('normal')).toBe(400);
    expect(cssWeight('bold')).toBe(700);
    expect(cssWeight('600')).toBe(600);
  });
});

describe('rasterizeHinted', () => {
  const CHAIN = '"Installed Mono", "Source Code Pro", "Nerd Font Icons", monospace';

  it('leaves everything to the canvas until the chain is prepared', async () => {
    const { rasterizeHinted } = await loadModule();
    expect(rasterizeHinted(CHAIN, 'normal', 'l', 0, 14)).toBeNull();
  });

  it('draws text from an installed family the backend can read', async () => {
    harness.available.add('Installed Mono');
    const latin = await readFile(LATIN);
    harness.invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
      if (command === 'font_face_find') {
        return { id: 'installed.ttf', index: 0, weight: args.weight, italic: false };
      }
      if (command === 'font_face_data') return Uint8Array.from(latin).buffer;
      throw new Error(command);
    });
    const { prepareHintedFonts, rasterizeHinted } = await loadModule();
    await prepareHintedFonts(CHAIN, 'normal');
    expect(harness.invoke).toHaveBeenCalledWith('font_face_find', {
      family: 'Installed Mono',
      weight: 700,
      italic: true,
    });
    const mask = rasterizeHinted(CHAIN, 'normal', 'l', 0, 14);
    expect(mask?.top).toBeLessThan(0);
    expect(rasterizeHinted(CHAIN, 'normal', '\ue0a0', 0, 14)).toBeNull();
    expect(rasterizeHinted(CHAIN, 'normal', '\u4e2d', 0, 14)).toBeNull();
    expect(rasterizeHinted(CHAIN, 'normal', 'ab', 0, 14)).toBeNull();
  });

  it('skips a family the webview cannot find and draws with the bundled font', async () => {
    const { prepareHintedFonts, rasterizeHinted } = await loadModule();
    await prepareHintedFonts(CHAIN, 'normal');
    expect(harness.invoke).not.toHaveBeenCalled();
    expect(rasterizeHinted(CHAIN, 'normal', 'l', 0, 14)).not.toBeNull();
    expect(
      rasterizeHinted(CHAIN, 'normal', '\u0436', 3, 14),
      'cyrillic, bold italic',
    ).not.toBeNull();
  });

  it('hands the whole chain to the canvas when a drawable family cannot be read', async () => {
    harness.available.add('Installed Mono');
    harness.invoke.mockResolvedValue(null);
    const { prepareHintedFonts, rasterizeHinted } = await loadModule();
    await prepareHintedFonts(CHAIN, 'normal');
    expect(rasterizeHinted(CHAIN, 'normal', 'l', 0, 14)).toBeNull();
  });
});
