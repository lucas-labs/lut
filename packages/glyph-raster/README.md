# @lut/glyph-raster

Hinted glyph rasterizer for lut's terminal. The webview's 2D canvas draws text without grid
fitting, so vertical stems that fall between two pixels come out as two grey ones; native
terminals (DirectWrite, FreeType) snap them to whole pixels. This crate does the same in the
webview: it hints each glyph with [skrifa](https://github.com/googlefonts/fontations) (the font's
TrueType instructions, or the automatic hinter for fonts without them) and fills it with
[zeno](https://github.com/dfrg/zeno) into an 8-bit coverage mask the glyph atlas takes as is.

- `src/lib.rs`: the C ABI the loader calls (`lut_font_load`, `lut_rasterize`...).
- `lib/index.ts`: the loader (`GlyphRaster`), synchronous after `load`.
- `glyph-raster.wasm`: the committed build, so building the app needs no wasm toolchain.

The terminal side is `src/modules/terminal/ghostty/gpu/hintedGlyphs.ts`.

## Rebuilding

```sh
rustup target add wasm32-unknown-unknown   # once
pnpm build:glyph-raster                    # cargo build, copy, print the SHA-256
```

Update `GLYPH_RASTER_WASM_SHA256` in `lib/index.ts` with the printed hash
(`hintedGlyphs.test.ts` pins it). `cargo test` in this directory runs the crate's tests.
