# Per-pane appearance (E14-01)

How far a pane can differ from the global terminal appearance with the shared WebGPU window canvas, its glyph atlases
and the WebGL fallback. Decides the scope of profile appearance overrides (E14-16, PRO-005, decision 9). Checked on
2026-11-16 against `master` at 0ab6613, on Windows 11 at 100% scale.

## What the renderers already do per pane

| Part                 | Where                                                                    | Per pane today?                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Palette on the GPU   | `WebGpuTerminalSurface.setTheme`, `WebGlTerminalSurface.setTheme`        | Yes. Colours go into the pane's own cell buffers; the atlases hold coverage only, so a palette change costs no atlas.                    |
| Palette in the model | `model.setColors` in `applyThemeToSession`                               | Yes, per session.                                                                                                                        |
| Colour queries       | `pty.setColors` → `pty_set_colors` (`src-tauri/src/modules/pty/mod.rs`)  | Yes. The backend keeps a scheme per session and answers `OSC 4/10/11/12` and `CSI ? 996 n` from it.                                      |
| Palette source       | `readTerminalGpuTheme()` (`terminalVisuals.ts`) → `readTerminalTokens()` | **No.** It reads the document's CSS tokens, so every pane gets the app theme. A per-pane theme needs a resolver from a theme definition. |
| Font                 | `updateSessionFont` → `surface.setFontMetrics`                           | Yes, per session, without respawning the PTY.                                                                                            |
| Cursor style, blink  | `surface.setCursorOptions`                                               | Yes, per surface.                                                                                                                        |
| Scrollback           | `scrollbackLimit` in `createModel` (`useGhosttyTerminalSession.ts`)      | Per session, fixed when the session starts.                                                                                              |
| Opacity              | `WebGpuWindowCanvas` configures the canvas with `alphaMode: 'opaque'`    | **No.** `backgroundOpacity` only dims the window background image (`SurfaceLayer.tsx`).                                                  |
| Padding              | `TerminalPane.tsx` host is `absolute inset-0`                            | Does not exist, globally or per pane.                                                                                                    |

## Atlas budget

- **WebGPU.** One `GlyphAtlas` per distinct font key in the window's runtime (`fontAtlasKey`): family, size, weight,
  line height, letter spacing, symbol fonts, scale and device cell metrics. Panes with the same key share it.
  - `MAX_ATLAS_COUNT = 8` atlases total, including up to one warm unused atlas (`MAX_WARM_UNUSED_ATLASES = 1`).
  - If the budget is full and no unused atlas can be evicted, a new key throws in `acquireGlyphAtlas`, and the pane
    shows a renderer error. Nothing falls back to the default font today.
  - An atlas starts with a 1024² coverage plane: `r8unorm`, or `rgba8unorm` with subpixel text. It grows to 2048² and
    4096². A 512² `rgba8unorm` colour plane for emoji appears on first use and grows to 2048².
  - Worst case per atlas: 32 MiB in grayscale, 80 MiB with subpixel text. Typical: about 1 MiB.
- **WebGL.** Each pane leases one renderer slot (`MAX_WEBGL_RENDERER_SLOTS = 12`, 4 panes per tab), and every slot
  owns its own atlas (1024² plus a 512² colour atlas).
  - Panes never share atlases, so a different font per pane costs nothing extra.
  - A font change resets the slot's atlas.
- **Hinted rasterizer** (Windows and Linux, `hintedGlyphs.ts`). Each new family and weight loads its font files into
  the WASM rasterizer, and they are never released for the life of the window.

## Prototype measurements

The prototype was not merged (saved outside the repo as a patch). It did three things:

- assigned a font per pane through a local override;
- timed the CPU work of each drawn frame in both runtimes' `flushFrame`;
- sampled `webGpuTerminalRuntimeDiagnostics`, `webGlTerminalRuntimeDiagnostics`, the rasterizer's linear memory and
  the JS heap.

The setup:

- one tab with 4 panes, a 1162×613 CSS px canvas at DPR 1;
- PowerShell in each pane, printing 20,000 lines with ASCII, arrows, box drawing, `✓`, `λ` and accents;
- 8 s per run, with the lut window focused (16.7 ms frame interval).

The four fonts were:

1. the configured terminal font, unchanged;
2. Cascadia Mono 15;
3. Consolas 13;
4. Courier New 14 at weight 500.

| Renderer | Fonts | Frames drawn | Frame CPU mean | p50    | p95    | p99    | max     | Atlas memory                          | Rasterizer WASM |
| -------- | ----- | ------------ | -------------- | ------ | ------ | ------ | ------- | ------------------------------------- | --------------- |
| WebGPU   | 1     | 128          | 0.46 ms        | 0.4 ms | 1.0 ms | 2.2 ms | 2.5 ms  | 1 atlas, 1.02 MiB GPU, 0.02 MiB CPU   | 10.25 MiB       |
| WebGPU   | 4     | 110          | 0.39 ms        | 0.3 ms | 0.7 ms | 1.5 ms | 1.6 ms  | 4 atlases, 4.06 MiB GPU, 0.69 MiB CPU | 15.31 MiB       |
| WebGL    | 1     | 127          | 0.65 ms        | 0.4 ms | 1.3 ms | 4.6 ms | 13.6 ms | 4 slots, 4 MiB                        | 15.31 MiB       |
| WebGL    | 4     | 100          | 0.36 ms        | 0.4 ms | 0.7 ms | 1.0 ms | 1.0 ms  | 4 slots, 4 MiB                        | 15.31 MiB       |

- **Frame time.** It does not change with the number of fonts. The work per frame is one draw per pane either way.
  The spread between runs (the WebGL single-font max of 13.6 ms) is noise from first frames and shell start-up, not
  fonts.
- **Atlases.** Every extra font adds one atlas: about 1 MiB of GPU memory at this size, no growth and no flushes.
- **Rasterizer.** The three extra families added 9 font files and 5.06 MiB of rasterizer memory, about 1.7 MiB per
  family. It is not released.
- **JS heap.** It stayed between 78 and 94 MiB in every run, with no trend.
- **Memory in the other runs.** Runs without the window focused (as few as 8 frames in 8 s) and a run without load
  showed the same memory figures. Their frame numbers were discarded.

## Recommendation for v1

**Per pane, resolved global → profile → pane (E14-16):**

| Field                                                      | Why it is cheap                                                    | What E14-16 needs                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Colour scheme (fg, bg, cursor, selection, 16 ANSI colours) | Per surface, per model and per PTY already; no atlas cost.         | Build `TerminalGpuTheme` from a theme id instead of the document's CSS tokens. The app chrome keeps the app theme. |
| Font family, size, weight                                  | Per session already; about 1 MiB per distinct font, no frame cost. | Over the 8-atlas budget, fall back to the global font with a warning instead of the renderer error.                |
| Cursor style and blink                                     | Per surface already.                                               | Read them from the resolved preferences instead of the global store.                                               |
| Scrollback                                                 | Per session at start.                                              | Applies to sessions started after the change. A live change is out of scope.                                       |

**Global:**

- letter spacing, line height and symbol fonts: they are part of the atlas key, so keeping them global bounds the
  number of atlases to the number of fonts;
- zoom: it multiplies every pane's size;
- background opacity, background image and blur: they are window-level, and the WebGPU canvas is opaque;
- subpixel text and renderer choice: one pipeline and one renderer per window;
- padding: it did not exist when this was checked. E14-21 later added it, globally and per profile, as the padding of
  each pane; detected profiles take it from their override since E15-02.
